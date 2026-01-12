/**
 * TestMCPClient - In-memory MCP client for integration testing
 *
 * This module provides a test harness for the mgrep MCP server that enables
 * programmatic testing without stdio transport. It uses the MCP SDK's
 * InMemoryTransport to connect a Client directly to a Server in the same process.
 *
 * @example
 * ```typescript
 * const client = new TestMCPClient({ rootPath: '/tmp/test-project' });
 * await client.connect();
 *
 * // Seed test data
 * await client.seedData([
 *   { path: 'src/index.ts', content: 'export function main() {}' }
 * ]);
 *
 * // Call tools
 * const result = await client.callTool('mgrep-search', { query: 'main function' });
 *
 * await client.disconnect();
 * ```
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type Tool,
  type Prompt,
} from "@modelcontextprotocol/sdk/types.js";

import { TestStore, type FileMetadata, type Store } from "./store.js";
import { MGREP_TOOLS, MGREP_PROMPTS } from "../commands/watch_mcp.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a TestMCPClient instance.
 */
export interface TestMCPClientOptions {
  /**
   * Root path for file operations. Defaults to a temporary directory.
   */
  rootPath?: string;

  /**
   * Path for the TestStore JSON file. Defaults to a temp file.
   */
  testStorePath?: string;

  /**
   * Store ID to use. Defaults to 'test-store'.
   */
  storeId?: string;
}

/**
 * File data for seeding the test store.
 */
export interface TestFile {
  /**
   * Relative path from root (e.g., 'src/index.ts')
   */
  path: string;

  /**
   * File content
   */
  content: string;
}

/**
 * Result from calling an MCP tool.
 */
export interface ToolResult {
  /**
   * Content returned by the tool
   */
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;

  /**
   * Whether the tool call resulted in an error
   */
  isError?: boolean;
}

/**
 * Resource returned by listResources.
 */
export interface Resource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

/**
 * Content returned by readResource.
 */
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * Prompt message returned by getPrompt.
 */
export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: string;
    text?: string;
  };
}

// ============================================================================
// TestMCPClient Class
// ============================================================================

/**
 * In-memory MCP client for testing mgrep tools without stdio transport.
 *
 * This class creates a complete MCP client-server setup using InMemoryTransport,
 * allowing tests to call tools programmatically and verify responses.
 *
 * Features:
 * - Uses TestStore for data isolation between tests
 * - Supports all 11 mgrep tools
 * - Provides helpers for seeding and clearing test data
 * - No external dependencies (Qdrant, API keys)
 */
export class TestMCPClient {
  private client: Client | null = null;
  private server: Server | null = null;
  private store: TestStore | null = null;
  private rootPath: string;
  private testStorePath: string;
  private storeId: string;
  private connected = false;

  /**
   * Creates a new TestMCPClient instance.
   *
   * @param options - Configuration options
   */
  constructor(options: TestMCPClientOptions = {}) {
    this.rootPath =
      options.rootPath ?? path.join(os.tmpdir(), `mgrep-test-${Date.now()}`);
    this.testStorePath =
      options.testStorePath ??
      path.join(os.tmpdir(), `mgrep-test-store-${Date.now()}.json`);
    this.storeId = options.storeId ?? "test-store";
  }

  /**
   * Connects the client to the server.
   *
   * This method:
   * 1. Creates a TestStore instance
   * 2. Creates the MCP Server with tool handlers
   * 3. Creates the MCP Client
   * 4. Links them via InMemoryTransport
   *
   * @throws Error if already connected
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error("TestMCPClient is already connected");
    }

    // Ensure root directory exists
    await fs.promises.mkdir(this.rootPath, { recursive: true });

    // Create store
    this.store = new TestStore(this.testStorePath);

    // Ensure the store exists
    try {
      await this.store.retrieve(this.storeId);
    } catch {
      await this.store.create({
        name: this.storeId,
        description: "Test store for MCP integration tests",
      });
    }

    // Create server
    this.server = new Server(
      { name: "mgrep-test", version: "0.0.1" },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    // Register handlers
    this.registerToolHandlers();
    this.registerResourceHandlers();
    this.registerPromptHandlers();

    // Create client
    this.client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    // Connect via InMemoryTransport
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      this.client.connect(clientTransport),
      this.server.connect(serverTransport),
    ]);

    this.connected = true;
  }

  /**
   * Disconnects the client and cleans up resources.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client?.close();
    } catch {
      // Ignore close errors
    }

    try {
      await this.server?.close();
    } catch {
      // Ignore close errors
    }

    this.client = null;
    this.server = null;
    this.store = null;
    this.connected = false;
  }

  /**
   * Calls an MCP tool by name.
   *
   * @param name - Tool name (e.g., 'mgrep-search')
   * @param args - Tool arguments
   * @returns Tool result
   * @throws Error if not connected or tool fails
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolResult> {
    this.ensureConnected();

    const result = await this.client!.callTool({ name, arguments: args });

    return {
      content: result.content as ToolResult["content"],
      isError: result.isError,
    };
  }

  /**
   * Lists all available tools.
   *
   * @returns Array of tool definitions
   */
  async listTools(): Promise<Tool[]> {
    this.ensureConnected();
    const result = await this.client!.listTools();
    return result.tools;
  }

  /**
   * Lists all available resources.
   *
   * @returns Array of resource definitions
   */
  async listResources(): Promise<Resource[]> {
    this.ensureConnected();
    const result = await this.client!.listResources();
    return result.resources as Resource[];
  }

  /**
   * Reads a resource by URI.
   *
   * @param uri - Resource URI (e.g., 'mgrep://file/src/index.ts')
   * @returns Resource content
   */
  async readResource(uri: string): Promise<ResourceContent> {
    this.ensureConnected();
    const result = await this.client!.readResource({ uri });
    return result.contents[0] as ResourceContent;
  }

  /**
   * Lists all available prompts.
   *
   * @returns Array of prompt definitions
   */
  async listPrompts(): Promise<Prompt[]> {
    this.ensureConnected();
    const result = await this.client!.listPrompts();
    return result.prompts;
  }

  /**
   * Gets a prompt by name with arguments.
   *
   * @param name - Prompt name
   * @param args - Prompt arguments
   * @returns Prompt messages
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {},
  ): Promise<PromptMessage[]> {
    this.ensureConnected();
    const result = await this.client!.getPrompt({ name, arguments: args });
    return result.messages as PromptMessage[];
  }

  /**
   * Seeds test data into the store.
   *
   * This method:
   * 1. Creates files on disk in the root directory
   * 2. Uploads them to the TestStore
   *
   * @param files - Array of test files to seed
   */
  async seedData(files: TestFile[]): Promise<void> {
    this.ensureConnected();

    for (const file of files) {
      const fullPath = path.join(this.rootPath, file.path);
      const dir = path.dirname(fullPath);

      // Ensure directory exists
      await fs.promises.mkdir(dir, { recursive: true });

      // Write file to disk
      await fs.promises.writeFile(fullPath, file.content, "utf-8");

      // Upload to store using the seedTestData helper
      await this.store!.seedTestData(fullPath, file.content);
    }
  }

  /**
   * Clears all test data from the store.
   */
  async clearData(): Promise<void> {
    this.ensureConnected();
    await this.store!.clearTestData();
  }

  /**
   * Gets the root path for this test client.
   */
  getRootPath(): string {
    return this.rootPath;
  }

  /**
   * Gets the store ID.
   */
  getStoreId(): string {
    return this.storeId;
  }

  /**
   * Gets direct access to the TestStore (for advanced testing).
   */
  getStore(): TestStore {
    this.ensureConnected();
    return this.store!;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureConnected(): void {
    if (!this.connected || !this.client || !this.store) {
      throw new Error("TestMCPClient is not connected. Call connect() first.");
    }
  }

  private registerToolHandlers(): void {
    const store = this.store!;
    const root = this.rootPath;
    const storeId = this.storeId;

    // List tools
    this.server!.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: MGREP_TOOLS };
    });

    // Handle tool calls
    this.server!.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "mgrep-search": {
            const query = args?.query as string;
            const pathFilter = args?.path as string | undefined;
            const maxResults = (args?.max_results as number) ?? 10;
            const includeContent = (args?.include_content as boolean) ?? false;

            if (!query) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Query parameter is required",
              );
            }

            const searchPath = pathFilter
              ? pathFilter.startsWith("/")
                ? pathFilter
                : path.join(root, pathFilter)
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
              [storeId],
              query,
              maxResults,
              { rerank: true },
              filters,
            );

            const formatted = this.formatSearchResults(
              results.data,
              includeContent,
            );
            return { content: [{ type: "text", text: formatted }] };
          }

          case "mgrep-stats": {
            const stats = await store.getStats(storeId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(stats, null, 2),
                },
              ],
            };
          }

          case "mgrep-list-files": {
            const pathPrefix = args?.path_prefix as string | undefined;
            const limit = (args?.limit as number) ?? 50;
            const offset = (args?.offset as number) ?? 0;

            const files: Array<{ path: string; hash?: string }> = [];
            let count = 0;

            for await (const file of store.listFiles(storeId, { pathPrefix })) {
              if (count >= offset && files.length < limit) {
                const metadata = file.metadata as FileMetadata | undefined;
                files.push({
                  path: metadata?.path ?? file.external_id ?? "unknown",
                  hash: metadata?.hash,
                });
              }
              count++;
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ files, total: count }, null, 2),
                },
              ],
            };
          }

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

            const resolved = filePath.startsWith("/")
              ? filePath
              : path.join(root, filePath);

            try {
              const content = await fs.promises.readFile(resolved, "utf-8");
              const lines = content.split("\n");

              const start = startLine ? startLine - 1 : 0;
              const end = endLine ?? lines.length;
              const sliced = lines.slice(start, end).join("\n");

              return { content: [{ type: "text", text: sliced }] };
            } catch {
              throw new McpError(
                ErrorCode.InvalidParams,
                `File not found: ${filePath}`,
              );
            }
          }

          case "mgrep-get-context": {
            const filePath = args?.path as string;
            const line = args?.line as number;
            const contextLines = (args?.context_lines as number) ?? 20;

            if (!filePath || !line) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Path and line parameters are required",
              );
            }

            const resolved = filePath.startsWith("/")
              ? filePath
              : path.join(root, filePath);

            try {
              const content = await fs.promises.readFile(resolved, "utf-8");
              const lines = content.split("\n");
              const start = Math.max(0, line - contextLines - 1);
              const end = Math.min(lines.length, line + contextLines);
              const context = lines
                .slice(start, end)
                .map((l, i) => `${start + i + 1}: ${l}`)
                .join("\n");

              return { content: [{ type: "text", text: context }] };
            } catch {
              throw new McpError(
                ErrorCode.InvalidParams,
                `File not found: ${filePath}`,
              );
            }
          }

          case "mgrep-find-symbol": {
            const symbolName = args?.name as string;
            const symbolType = args?.type as string | undefined;
            const pathFilter = args?.path as string | undefined;
            const exact = (args?.exact as boolean) ?? false;
            const maxResults = (args?.max_results as number) ?? 20;

            if (!symbolName) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Name parameter is required",
              );
            }

            const results = await store.findSymbols(storeId, symbolName, {
              type: symbolType,
              path: pathFilter ? path.join(root, pathFilter) : undefined,
              exact,
              maxResults,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "mgrep-find-references": {
            const symbol = args?.symbol as string;
            const pathFilter = args?.path as string | undefined;
            const includeDefinition =
              (args?.include_definition as boolean) ?? false;
            const maxResults = (args?.max_results as number) ?? 50;

            if (!symbol) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Symbol parameter is required",
              );
            }

            const results = await store.findReferences(storeId, symbol, {
              path: pathFilter ? path.join(root, pathFilter) : undefined,
              includeDefinition,
              maxResults,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "mgrep-sync": {
            // For testing, sync is a no-op since we seed data directly
            return {
              content: [
                {
                  type: "text",
                  text: "Sync completed (test mode - no actual sync performed)",
                },
              ],
            };
          }

          case "mgrep-ask": {
            const question = args?.question as string;
            if (!question) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Question parameter is required",
              );
            }

            const results = await store.ask([storeId], question, 10, {
              rerank: true,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Answer: ${results.answer}\n\nSources: ${results.sources.length} chunks`,
                },
              ],
            };
          }

          case "mgrep-web-search": {
            // Web search is not available in test mode
            return {
              content: [
                {
                  type: "text",
                  text: "Web search is not available in test mode",
                },
              ],
              isError: true,
            };
          }

          case "mgrep-context": {
            const query = args?.query as string;
            const format = (args?.format as string) ?? "xml";
            const maxResults = (args?.max_results as number) ?? 10;

            if (!query) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Query parameter is required",
              );
            }

            const results = await store.search([storeId], query, maxResults, {
              rerank: true,
            });
            const formatted = this.formatContextExport(results.data, format);

            return { content: [{ type: "text", text: formatted }] };
          }

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
        throw new McpError(ErrorCode.InternalError, msg);
      }
    });
  }

  private registerResourceHandlers(): void {
    const store = this.store!;
    const root = this.rootPath;
    const storeId = this.storeId;

    // List resources
    this.server!.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources: Resource[] = [];

      for await (const file of store.listFiles(storeId, {})) {
        const metadata = file.metadata as FileMetadata | undefined;
        const filePath = metadata?.path ?? file.external_id ?? "unknown";

        resources.push({
          uri: `mgrep://file/${filePath}`,
          name: filePath,
          mimeType: "text/plain",
          description: `Indexed file: ${filePath}`,
        });
      }

      return { resources };
    });

    // Read resource
    this.server!.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const uri = request.params.uri;
        const filePath = uri.replace("mgrep://file/", "");

        const resolved = filePath.startsWith("/")
          ? filePath
          : path.join(root, filePath);

        if (!resolved.startsWith(root)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Path must be within project root",
          );
        }

        try {
          const content = await fs.promises.readFile(resolved, "utf-8");
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: content,
              },
            ],
          };
        } catch {
          throw new McpError(
            ErrorCode.InvalidParams,
            `File not found: ${filePath}`,
          );
        }
      },
    );
  }

  private registerPromptHandlers(): void {
    // List prompts
    this.server!.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: MGREP_PROMPTS };
    });

    // Get prompt
    this.server!.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const prompt = MGREP_PROMPTS.find((p) => p.name === name);
      if (!prompt) {
        throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
      }

      // Generate a simple prompt message for testing
      const message = `Prompt: ${name}\nArguments: ${JSON.stringify(args ?? {})}`;

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text", text: message },
          },
        ],
      };
    });
  }

  private formatSearchResults(
    chunks: Array<{
      metadata?: FileMetadata | Record<string, unknown>;
      score: number;
      generated_metadata?: { start_line?: number; num_lines?: number };
    }>,
    includeContent: boolean,
  ): string {
    if (chunks.length === 0) {
      return "No results found.";
    }

    const lines = chunks.map((chunk, i) => {
      const metadata = chunk.metadata as FileMetadata | undefined;
      const filePath = metadata?.path ?? "unknown";
      const startLine = (chunk.generated_metadata?.start_line ?? 0) + 1;
      const endLine = startLine + (chunk.generated_metadata?.num_lines ?? 0);
      const score = (chunk.score * 100).toFixed(2);

      return `${i + 1}. ${filePath}:${startLine}-${endLine} (${score}% match)`;
    });

    return `Found ${chunks.length} result(s):\n\n${lines.join("\n")}`;
  }

  private formatContextExport(
    chunks: Array<{
      metadata?: FileMetadata | Record<string, unknown>;
      text?: string;
      generated_metadata?: { start_line?: number };
    }>,
    format: string,
  ): string {
    if (format === "xml") {
      const items = chunks.map((chunk) => {
        const metadata = chunk.metadata as FileMetadata | undefined;
        return `<file path="${metadata?.path ?? "unknown"}">\n${(chunk as { text?: string }).text ?? ""}\n</file>`;
      });
      return `<context>\n${items.join("\n")}\n</context>`;
    }

    // Default to markdown
    const items = chunks.map((chunk) => {
      const metadata = chunk.metadata as FileMetadata | undefined;
      return `## ${metadata?.path ?? "unknown"}\n\`\`\`\n${(chunk as { text?: string }).text ?? ""}\n\`\`\``;
    });
    return items.join("\n\n");
  }
}
