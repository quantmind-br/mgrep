import * as fs from "node:fs";
import { join, normalize } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import {
  createFileSystem,
  createStore,
  createWebSearchClientFromConfig,
} from "../lib/context.js";
import type {
  AskResponse,
  ChunkType,
  FileMetadata,
  SearchResponse,
  Store,
  TextChunk,
} from "../lib/store.js";
import { initialSync } from "../lib/utils.js";
import { startWatch } from "./watch.js";

// ============================================================================
// Result Formatting Functions
// ============================================================================

function isWebResult(
  chunk: ChunkType,
): chunk is TextChunk & { filename: string } {
  return (
    chunk.type === "text" &&
    "filename" in chunk &&
    typeof chunk.filename === "string" &&
    chunk.filename.startsWith("http")
  );
}

function formatChunkForMcp(
  chunk: ChunkType,
  includeContent: boolean,
  pwd: string,
): string {
  if (isWebResult(chunk)) {
    const url = chunk.filename;
    const score = (chunk.score * 100).toFixed(2);
    const content = includeContent ? `\nContent: ${chunk.text}` : "";
    return `[Web] ${url} (${score}% match)${content}`;
  }

  const path =
    (chunk.metadata as FileMetadata)?.path?.replace(pwd, "") ?? "Unknown path";
  let lineRange = "";
  let content = "";

  switch (chunk.type) {
    case "text": {
      const startLine = (chunk.generated_metadata?.start_line ?? 0) + 1;
      const endLine = startLine + (chunk.generated_metadata?.num_lines ?? 0);
      lineRange = `:${startLine}-${endLine}`;
      content = includeContent ? `\nContent:\n${chunk.text}` : "";
      break;
    }
    case "image_url":
      lineRange =
        chunk.generated_metadata?.type === "pdf"
          ? `, page ${chunk.chunk_index + 1}`
          : "";
      break;
  }

  const score = (chunk.score * 100).toFixed(2);
  return `.${path}${lineRange} (${score}% match)${content}`;
}

function formatSearchResultsForMcp(
  response: SearchResponse,
  includeContent: boolean,
): string {
  const pwd = process.cwd();
  if (response.data.length === 0) {
    return "No results found.";
  }

  const results = response.data.map(
    (chunk, index) =>
      `${index + 1}. ${formatChunkForMcp(chunk, includeContent, pwd)}`,
  );

  return `Found ${response.data.length} result(s):\n\n${results.join("\n\n")}`;
}

function extractSources(response: AskResponse): { [key: number]: ChunkType } {
  const sources: { [key: number]: ChunkType } = {};
  const answer = response.answer;
  const citeTags = answer.match(/<cite i="(\d+(?:-\d+)?)"/g) ?? [];

  for (const tag of citeTags) {
    const index = tag.match(/i="(\d+(?:-\d+)?)"/)?.[1];
    if (!index) continue;

    if (!index.includes("-")) {
      const idx = Number(index);
      if (!Number.isNaN(idx) && idx < response.sources.length) {
        sources[idx] = response.sources[idx];
      }
      continue;
    }

    const [start, end] = index.split("-").map(Number);
    if (
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      start >= 0 &&
      end >= start &&
      end < response.sources.length
    ) {
      for (let i = start; i <= end; i++) {
        sources[i] = response.sources[i];
      }
    }
  }

  return sources;
}

function formatAskResultsForMcp(response: AskResponse): string {
  const pwd = process.cwd();
  const sources = extractSources(response);
  const sourceEntries = Object.entries(sources).map(
    ([index, chunk]) => `[${index}] ${formatChunkForMcp(chunk, false, pwd)}`,
  );

  return `${response.answer}\n\nSources:\n${sourceEntries.join("\n")}`;
}

// ============================================================================
// Web Search Helper
// ============================================================================

async function performWebSearch(
  query: string,
  maxResults: number,
): Promise<TextChunk[]> {
  const config = loadConfig(process.cwd());
  const webClient = createWebSearchClientFromConfig(config.tavily);
  const response = await webClient.search(query, { maxResults });

  return response.results.map((result, index) => ({
    type: "text" as const,
    text: result.content,
    score: result.score,
    filename: result.url,
    metadata: {
      path: result.url,
      hash: "",
      title: result.title,
    },
    chunk_index: index,
    generated_metadata: {
      start_line: 0,
      num_lines: result.content.split("\n").length,
    },
  }));
}

// ============================================================================
// Tool Definitions
// ============================================================================

const MGREP_TOOLS: Tool[] = [
  {
    name: "mgrep-search",
    description:
      "Semantic search over indexed local files. Finds code and documentation based on meaning and intent, not just keywords. Results include file paths, line numbers, and relevance scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language search query describing what you're looking for",
        },
        path: {
          type: "string",
          description:
            "Optional path filter to search within a specific directory (e.g., 'src/lib')",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
          default: 10,
          minimum: 1,
          maximum: 50,
        },
        include_content: {
          type: "boolean",
          description: "Include the actual content of matching chunks",
          default: false,
        },
        rerank: {
          type: "boolean",
          description: "Enable reranking for better result quality",
          default: true,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "mgrep-ask",
    description:
      "Ask questions about the codebase and get AI-generated answers with citations. Uses RAG (Retrieval-Augmented Generation) to provide accurate, source-backed responses.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Question to answer about the codebase",
        },
        path: {
          type: "string",
          description:
            "Optional path filter to limit the search scope (e.g., 'src/commands')",
        },
        max_results: {
          type: "number",
          description:
            "Maximum number of source chunks to consider (default: 10)",
          default: 10,
          minimum: 1,
          maximum: 50,
        },
        rerank: {
          type: "boolean",
          description: "Enable reranking for better context quality",
          default: true,
        },
      },
      required: ["question"],
    },
  },
  {
    name: "mgrep-web-search",
    description:
      "Search the web using Tavily AI search engine. Returns relevant web content with URLs and snippets. Requires MGREP_TAVILY_API_KEY or tavily.apiKey in config.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Web search query",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
          default: 10,
          minimum: 1,
          maximum: 20,
        },
        include_content: {
          type: "boolean",
          description: "Include the full content snippet for each result",
          default: true,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "mgrep-sync",
    description:
      "Synchronize local files with the vector store. Indexes new files, updates changed files, and removes deleted files. Use before searching if files have changed.",
    inputSchema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description:
            "If true, only show what would be synced without making changes",
          default: false,
        },
      },
    },
  },
  {
    name: "mgrep-get-file",
    description:
      "Retrieve file content with optional line range. Returns truncated content for large files. Supports both absolute and relative paths within the project.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file",
        },
        start_line: {
          type: "number",
          description: "Starting line (1-indexed)",
          minimum: 1,
        },
        end_line: {
          type: "number",
          description: "Ending line (inclusive)",
          minimum: 1,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "mgrep-list-files",
    description:
      "List indexed files with optional path filtering and pagination. Useful for exploring the indexed codebase structure.",
    inputSchema: {
      type: "object",
      properties: {
        path_prefix: {
          type: "string",
          description: "Filter by path prefix (e.g., 'src/lib')",
        },
        limit: {
          type: "number",
          description: "Max files to return",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: "number",
          description: "Skip N files (pagination)",
          default: 0,
          minimum: 0,
        },
        include_hash: {
          type: "boolean",
          description: "Include file hash in results",
          default: false,
        },
      },
    },
  },
  {
    name: "mgrep-get-context",
    description:
      "Get expanded context around a specific line in a file. Useful for viewing code around search results or citations.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file",
        },
        line: {
          type: "number",
          description: "Center line number (1-indexed)",
          minimum: 1,
        },
        context_lines: {
          type: "number",
          description: "Lines of context before and after center line",
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ["path", "line"],
    },
  },
  {
    name: "mgrep-stats",
    description:
      "Get statistics about the indexed store, including file count and store metadata.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ============================================================================
// MCP Server Implementation
// ============================================================================

export const watchMcp = new Command("mcp")
  .description("Start MCP server for mgrep with semantic search tools")
  .action(async (_options, cmd) => {
    // Signal handlers
    process.on("SIGINT", () => {
      console.error("Received SIGINT, shutting down gracefully...");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.error("Received SIGTERM, shutting down gracefully...");
      process.exit(0);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error(
        "[ERROR] Unhandled Rejection at:",
        promise,
        "reason:",
        reason,
      );
    });

    // Redirect console to stderr (MCP uses stdout for JSON-RPC)
    console.log = (...args: unknown[]) => {
      process.stderr.write(`[LOG] ${args.join(" ")}\n`);
    };

    console.error = (...args: unknown[]) => {
      process.stderr.write(`[ERROR] ${args.join(" ")}\n`);
    };

    console.debug = (...args: unknown[]) => {
      process.stderr.write(`[DEBUG] ${args.join(" ")}\n`);
    };

    const options: { store: string } = cmd.optsWithGlobals();
    const root = process.cwd();

    // Initialize store once
    let store: Store;
    try {
      store = await createStore();
      console.log("[MCP] Store initialized successfully");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Failed to initialize store: ${msg}`);
      process.exit(1);
    }

    // Create MCP server
    const transport = new StdioServerTransport();
    const server = new Server(
      {
        name: "mgrep",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Error handler
    server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: MGREP_TOOLS };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // ================================================================
          // mgrep-search: Semantic search
          // ================================================================
          case "mgrep-search": {
            const query = args?.query as string;
            const pathFilter = args?.path as string | undefined;
            const maxResults = (args?.max_results as number) ?? 10;
            const includeContent = (args?.include_content as boolean) ?? false;
            const rerank = (args?.rerank as boolean) ?? true;

            if (!query) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Query parameter is required",
              );
            }

            const searchPath = pathFilter
              ? pathFilter.startsWith("/")
                ? pathFilter
                : normalize(join(root, pathFilter))
              : root;

            const filters = {
              all: [
                {
                  key: "path",
                  operator: "starts_with" as const,
                  value: searchPath,
                },
              ],
            };

            const results = await store.search(
              [options.store],
              query,
              maxResults,
              { rerank },
              filters,
            );

            return {
              content: [
                {
                  type: "text",
                  text: formatSearchResultsForMcp(results, includeContent),
                },
              ],
            };
          }

          // ================================================================
          // mgrep-ask: RAG Question Answering
          // ================================================================
          case "mgrep-ask": {
            const question = args?.question as string;
            const pathFilter = args?.path as string | undefined;
            const maxResults = (args?.max_results as number) ?? 10;
            const rerank = (args?.rerank as boolean) ?? true;

            if (!question) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Question parameter is required",
              );
            }

            const searchPath = pathFilter
              ? pathFilter.startsWith("/")
                ? pathFilter
                : normalize(join(root, pathFilter))
              : root;

            const filters = {
              all: [
                {
                  key: "path",
                  operator: "starts_with" as const,
                  value: searchPath,
                },
              ],
            };

            const results = await store.ask(
              [options.store],
              question,
              maxResults,
              { rerank },
              filters,
            );

            return {
              content: [
                {
                  type: "text",
                  text: formatAskResultsForMcp(results),
                },
              ],
            };
          }

          // ================================================================
          // mgrep-web-search: Web search with Tavily
          // ================================================================
          case "mgrep-web-search": {
            const query = args?.query as string;
            const maxResults = (args?.max_results as number) ?? 10;
            const includeContent = (args?.include_content as boolean) ?? true;

            if (!query) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Query parameter is required",
              );
            }

            try {
              const webResults = await performWebSearch(query, maxResults);

              if (webResults.length === 0) {
                return {
                  content: [
                    {
                      type: "text",
                      text: "No web results found.",
                    },
                  ],
                };
              }

              const formatted = webResults
                .map((result, index) => {
                  const title =
                    (result.metadata as { title?: string })?.title ??
                    "Untitled";
                  const url = result.filename;
                  const score = (result.score * 100).toFixed(2);
                  const content = includeContent
                    ? `\nContent: ${result.text}`
                    : "";
                  return `${index + 1}. [${title}](${url}) (${score}% match)${content}`;
                })
                .join("\n\n");

              return {
                content: [
                  {
                    type: "text",
                    text: `Found ${webResults.length} web result(s):\n\n${formatted}`,
                  },
                ],
              };
            } catch (error) {
              const msg =
                error instanceof Error ? error.message : String(error);
              throw new McpError(
                ErrorCode.InternalError,
                `Web search failed: ${msg}`,
              );
            }
          }

          // ================================================================
          // mgrep-sync: File synchronization
          // ================================================================
          case "mgrep-sync": {
            const dryRun = (args?.dry_run as boolean) ?? false;

            try {
              const config = loadConfig(root);
              const fileSystem = createFileSystem({
                ignorePatterns: [],
                ignoreConfig: config.ignore,
              });

              // Ensure store exists
              try {
                await store.retrieve(options.store);
              } catch {
                await store.create({
                  name: options.store,
                  description: "mgrep store - Semantic search for local files",
                });
              }

              const result = await initialSync(
                store,
                fileSystem,
                options.store,
                root,
                dryRun,
                () => {}, // No progress callback for MCP
                config,
              );

              const action = dryRun ? "would sync" : "synced";
              const summary = [
                `Sync ${dryRun ? "(dry run) " : ""}complete:`,
                `- Files processed: ${result.processed}/${result.total}`,
                `- Files ${action}: ${result.uploaded}`,
                result.deleted > 0
                  ? `- Files deleted: ${result.deleted}`
                  : null,
                result.errors > 0 ? `- Errors: ${result.errors}` : null,
              ]
                .filter(Boolean)
                .join("\n");

              return {
                content: [
                  {
                    type: "text",
                    text: summary,
                  },
                ],
              };
            } catch (error) {
              const msg =
                error instanceof Error ? error.message : String(error);
              throw new McpError(
                ErrorCode.InternalError,
                `Sync failed: ${msg}`,
              );
            }
          }

          // ================================================================
          // mgrep-get-file: Retrieve file content
          // ================================================================
          case "mgrep-get-file": {
            const filePath = args?.path as string;
            const startLine = args?.start_line as number | undefined;
            const endLine = args?.end_line as number | undefined;

            if (!filePath) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Path parameter is required",
              );
            }

            // Resolve path and validate
            const resolved = filePath.startsWith("/")
              ? filePath
              : normalize(join(root, filePath));

            // Security: Prevent path traversal
            if (!resolved.startsWith(root)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Path must be within project root",
              );
            }

            // Security: Check symlinks don't escape root
            try {
              const lstats = await fs.promises.lstat(resolved);
              if (lstats.isSymbolicLink()) {
                const realPath = await fs.promises.realpath(resolved);
                if (!realPath.startsWith(root)) {
                  throw new McpError(
                    ErrorCode.InvalidParams,
                    "Symlink points outside project root",
                  );
                }
              }
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  `File not found: ${filePath}`,
                );
              }
              throw error;
            }

            const MAX_LINES = 2000;
            const MAX_BYTES = 100 * 1024; // 100KB

            const stat = await fs.promises.stat(resolved);
            const content = await fs.promises.readFile(resolved, "utf-8");
            const lines = content.split("\n");

            let resultLines = lines;
            let truncated = false;

            // Apply line range filter
            if (startLine || endLine) {
              const start = (startLine ?? 1) - 1;
              const end = endLine ?? lines.length;
              resultLines = lines.slice(start, end);
            }

            // Apply size limits with truncation
            if (resultLines.length > MAX_LINES || stat.size > MAX_BYTES) {
              resultLines = resultLines.slice(0, MAX_LINES);
              truncated = true;
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      path: resolved.replace(root, "."),
                      content: resultLines.join("\n"),
                      total_lines: lines.length,
                      returned_lines: resultLines.length,
                      truncated,
                      size_bytes: stat.size,
                      modified_at: stat.mtime.toISOString(),
                      ...(truncated && {
                        hint: "Use start_line/end_line to read specific sections",
                      }),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // ================================================================
          // mgrep-list-files: List indexed files
          // ================================================================
          case "mgrep-list-files": {
            const pathPrefix = args?.path_prefix as string | undefined;
            const limit = Math.min((args?.limit as number) ?? 50, 200);
            const offset = (args?.offset as number) ?? 0;
            const includeHash = (args?.include_hash as boolean) ?? false;

            const absolutePrefix = pathPrefix
              ? pathPrefix.startsWith("/")
                ? pathPrefix
                : normalize(join(root, pathPrefix))
              : root;

            const files: Array<{ path: string; hash?: string }> = [];
            let skipped = 0;

            for await (const file of store.listFiles(options.store, {
              pathPrefix: absolutePrefix,
            })) {
              if (skipped < offset) {
                skipped++;
                continue;
              }
              if (files.length >= limit) break;

              const relativePath =
                (file.metadata as FileMetadata)?.path?.replace(root, ".") ??
                file.external_id ??
                "unknown";
              files.push({
                path: relativePath,
                ...(includeHash && (file.metadata as FileMetadata)?.hash
                  ? { hash: (file.metadata as FileMetadata).hash }
                  : {}),
              });
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      files,
                      count: files.length,
                      offset,
                      has_more: files.length === limit,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // ================================================================
          // mgrep-get-context: Get expanded context around a line
          // ================================================================
          case "mgrep-get-context": {
            const filePath = args?.path as string;
            const centerLine = args?.line as number;
            const contextLines = Math.min(
              (args?.context_lines as number) ?? 20,
              100,
            );

            if (!filePath || !centerLine) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "path and line are required",
              );
            }

            const resolved = filePath.startsWith("/")
              ? filePath
              : normalize(join(root, filePath));

            if (!resolved.startsWith(root)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Path must be within project root",
              );
            }

            let content: string;
            try {
              content = await fs.promises.readFile(resolved, "utf-8");
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new McpError(
                  ErrorCode.InvalidParams,
                  `File not found: ${filePath}`,
                );
              }
              throw error;
            }

            const lines = content.split("\n");

            if (centerLine > lines.length) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Line ${centerLine} exceeds file length (${lines.length})`,
              );
            }

            const start = Math.max(0, centerLine - 1 - contextLines);
            const end = Math.min(
              lines.length,
              centerLine - 1 + contextLines + 1,
            );
            const contextSlice = lines.slice(start, end);

            // Add line numbers with center line marker
            const numberedLines = contextSlice.map((line, i) => {
              const lineNum = start + i + 1;
              const marker = lineNum === centerLine ? ">" : " ";
              return `${marker}${String(lineNum).padStart(4)} | ${line}`;
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      path: resolved.replace(root, "."),
                      center_line: centerLine,
                      start_line: start + 1,
                      end_line: end,
                      total_lines: lines.length,
                      context: numberedLines.join("\n"),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // ================================================================
          // mgrep-stats: Get store statistics
          // ================================================================
          case "mgrep-stats": {
            const stats = await store.getStats(options.store);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      store_name: stats.store_name,
                      description: stats.description,
                      chunk_count: stats.chunk_count,
                      file_count: stats.file_count,
                      created_at: stats.created_at,
                      updated_at: stats.updated_at,
                      root_path: root,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          // ================================================================
          // Unknown tool
          // ================================================================
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Tool ${name} failed: ${msg}`);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Connect server
    await server.connect(transport);
    console.log(
      "[MCP] Server started with tools:",
      MGREP_TOOLS.map((t) => t.name).join(", "),
    );

    // Start background sync after delay
    const startBackgroundSync = async () => {
      console.log("[SYNC] Scheduling initial sync in 5 seconds...");

      setTimeout(async () => {
        console.log("[SYNC] Starting file sync...");
        try {
          await startWatch({ store: options.store, dryRun: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("[SYNC] Sync failed:", errorMessage);
        }
      }, 5000);
    };

    startBackgroundSync().catch((error) => {
      console.error("[SYNC] Background sync setup failed:", error);
    });
  });
