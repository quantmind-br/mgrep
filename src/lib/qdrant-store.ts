import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { EmbeddingsClient, LLMClient } from "./providers/types.js";
import type {
  AskResponse,
  CreateStoreOptions,
  FileMetadata,
  ListFilesOptions,
  SearchFilter,
  SearchResponse,
  Store,
  StoreFile,
  StoreInfo,
  TextChunk,
  UploadFileOptions,
} from "./store.js";

interface QdrantStoreConfig {
  url: string;
  apiKey?: string;
  embeddingsClient: EmbeddingsClient;
  llmClient: LLMClient;
  collectionPrefix?: string;
}

interface QdrantPayload {
  external_id: string;
  path: string;
  path_scopes: string[]; // For starts_with filtering
  hash: string;
  content: string;
  chunk_index: number;
  start_line: number;
  num_lines: number;
  filename: string;
}

/**
 * Generates deterministic point IDs for Qdrant
 * Uses first 32 chars of SHA256 hash as UUID-compatible string
 */
function generatePointId(externalId: string, chunkIndex: number): string {
  const hash = createHash("sha256")
    .update(`${externalId}:${chunkIndex}`)
    .digest("hex");
  // Format as UUID-like string (Qdrant accepts strings as point IDs)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Generates path scopes for prefix matching
 * e.g., "/home/user/project/src/file.ts" -> ["/home", "/home/user", "/home/user/project", ...]
 */
function generatePathScopes(filePath: string): string[] {
  const scopes: string[] = [];
  const parts = filePath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    scopes.push(current);
  }
  // Also add the full path
  if (filePath.startsWith("/")) {
    scopes.unshift("/");
  }
  return scopes;
}

export class QdrantStore implements Store {
  private client: QdrantClient;
  private embeddings: EmbeddingsClient;
  private llm: LLMClient;
  private collectionPrefix: string;
  private vectorSize?: number;

  constructor(config: QdrantStoreConfig) {
    // Parse URL to extract host, port, and https settings
    // The Qdrant JS client doesn't correctly parse port from URL
    const parsedUrl = new URL(config.url);
    const isHttps = parsedUrl.protocol === "https:";
    const defaultPort = isHttps ? 443 : 80;
    const port = parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : defaultPort;

    this.client = new QdrantClient({
      host: parsedUrl.hostname,
      port,
      https: isHttps,
      apiKey: config.apiKey,
      checkCompatibility: false,
    });
    this.embeddings = config.embeddingsClient;
    this.llm = config.llmClient;
    this.collectionPrefix = config.collectionPrefix || "mgrep_";
  }

  private getCollectionName(storeId: string): string {
    // Sanitize storeId to be a valid collection name
    const sanitized = storeId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${this.collectionPrefix}${sanitized}`;
  }

  private async ensureCollection(storeId: string): Promise<void> {
    const collectionName = this.getCollectionName(storeId);

    try {
      await this.client.getCollection(collectionName);
    } catch {
      // Collection doesn't exist, create it
      if (!this.vectorSize) {
        this.vectorSize = await this.embeddings.getDimensions();
      }

      await this.client.createCollection(collectionName, {
        vectors: {
          size: this.vectorSize,
          distance: "Cosine",
        },
      });

      // Create payload indexes for efficient filtering
      await this.client.createPayloadIndex(collectionName, {
        field_name: "external_id",
        field_schema: "keyword",
      });

      await this.client.createPayloadIndex(collectionName, {
        field_name: "path",
        field_schema: "keyword",
      });

      await this.client.createPayloadIndex(collectionName, {
        field_name: "path_scopes",
        field_schema: "keyword",
      });
    }
  }

  /**
   * Split text into chunks for embedding
   */
  private chunkText(
    content: string,
    _filename: string,
  ): Array<{
    text: string;
    startLine: number;
    numLines: number;
  }> {
    const lines = content.split("\n");
    const chunks: Array<{ text: string; startLine: number; numLines: number }> =
      [];

    const CHUNK_SIZE = 50; // lines per chunk
    const OVERLAP = 10; // overlap between chunks

    for (let i = 0; i < lines.length; i += CHUNK_SIZE - OVERLAP) {
      const chunkLines = lines.slice(i, i + CHUNK_SIZE);
      if (chunkLines.length === 0) continue;

      chunks.push({
        text: chunkLines.join("\n"),
        startLine: i,
        numLines: chunkLines.length,
      });
    }

    // If file is small, ensure at least one chunk
    if (chunks.length === 0 && content.trim()) {
      chunks.push({
        text: content,
        startLine: 0,
        numLines: lines.length,
      });
    }

    return chunks;
  }

  private async readContent(file: File | ReadableStream): Promise<string> {
    if (
      "text" in file &&
      typeof (file as { text: unknown }).text === "function"
    ) {
      return await (file as File).text();
    }

    // Handle Node.js ReadableStream (from fs.createReadStream)
    if (
      typeof (file as unknown as AsyncIterable<unknown>)[
        Symbol.asyncIterator
      ] === "function"
    ) {
      const chunks: Buffer[] = [];
      for await (const chunk of file as unknown as AsyncIterable<
        Uint8Array | string
      >) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf-8");
    }

    // Handle Web ReadableStream
    if ("getReader" in file) {
      const reader = (file as ReadableStream).getReader();
      const decoder = new TextDecoder();
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
      result += decoder.decode();
      return result;
    }

    throw new Error("Unknown file type");
  }

  async *listFiles(
    storeId: string,
    options?: ListFilesOptions,
  ): AsyncGenerator<StoreFile> {
    const collectionName = this.getCollectionName(storeId);

    try {
      await this.client.getCollection(collectionName);
    } catch {
      return; // Collection doesn't exist
    }

    let offset: string | number | undefined;
    const limit = 100;

    // Build filter for path prefix using path_scopes
    const filter = options?.pathPrefix
      ? {
          must: [
            {
              key: "path_scopes",
              match: { value: options.pathPrefix },
            },
          ],
        }
      : undefined;

    // Get unique external_ids
    const seenExternalIds = new Set<string>();

    do {
      const result = await this.client.scroll(collectionName, {
        limit,
        offset,
        filter,
        with_payload: true,
        with_vector: false,
      });

      for (const point of result.points) {
        const payload = point.payload as unknown as QdrantPayload;

        // Skip duplicates (multiple chunks per file)
        if (seenExternalIds.has(payload.external_id)) {
          continue;
        }
        seenExternalIds.add(payload.external_id);

        yield {
          external_id: payload.external_id,
          metadata: {
            path: payload.path,
            hash: payload.hash,
          },
        };
      }

      offset =
        typeof result.next_page_offset === "string" ||
        typeof result.next_page_offset === "number"
          ? result.next_page_offset
          : undefined;
    } while (offset !== undefined && offset !== null);
  }

  async uploadFile(
    storeId: string,
    file: File | ReadableStream,
    options: UploadFileOptions,
  ): Promise<void> {
    await this.ensureCollection(storeId);
    const collectionName = this.getCollectionName(storeId);

    // Read file content
    const content = await this.readContent(file);

    // Delete existing chunks for this file (if overwriting)
    if (options.overwrite !== false) {
      await this.deleteFile(storeId, options.external_id);
    }

    // Chunk the content
    const filename =
      options.external_id.split("/").pop() || options.external_id;
    const chunks = this.chunkText(content, filename);

    if (chunks.length === 0) {
      return; // Empty file
    }

    // Generate embeddings for all chunks
    const embeddings = await this.embeddings.embedBatch(
      chunks.map((c) => c.text),
    );

    // Generate path scopes for filtering
    const pathScopes = generatePathScopes(
      options.metadata?.path || options.external_id,
    );

    // Prepare points for Qdrant
    const points = chunks.map((chunk, index) => ({
      id: generatePointId(options.external_id, index),
      vector: embeddings[index].embedding,
      payload: {
        external_id: options.external_id,
        path: options.metadata?.path || options.external_id,
        path_scopes: pathScopes,
        hash: options.metadata?.hash || "",
        content: chunk.text,
        chunk_index: index,
        start_line: chunk.startLine,
        num_lines: chunk.numLines,
        filename,
      } satisfies QdrantPayload,
    }));

    // Upsert points to Qdrant
    await this.client.upsert(collectionName, {
      wait: true,
      points,
    });
  }

  async deleteFile(storeId: string, externalId: string): Promise<void> {
    const collectionName = this.getCollectionName(storeId);

    try {
      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: "external_id",
              match: { value: externalId },
            },
          ],
        },
      });
    } catch {
      // Collection might not exist, ignore
    }
  }

  async search(
    storeIds: string[],
    query: string,
    top_k = 10,
    _search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<SearchResponse> {
    // Generate query embedding
    const queryEmbedding = await this.embeddings.embed(query);

    const allResults: TextChunk[] = [];

    for (const storeId of storeIds) {
      const collectionName = this.getCollectionName(storeId);

      try {
        await this.client.getCollection(collectionName);
      } catch {
        continue; // Skip non-existent collections
      }

      // Build filter for path prefix
      let qdrantFilter: Record<string, unknown> | undefined;
      if (filters?.all) {
        const pathFilter = filters.all.find(
          (f) => f.key === "path" && f.operator === "starts_with",
        );
        if (pathFilter) {
          qdrantFilter = {
            must: [
              {
                key: "path_scopes",
                match: { value: pathFilter.value },
              },
            ],
          };
        }
      }

      const searchResult = await this.client.search(collectionName, {
        vector: queryEmbedding.embedding,
        limit: top_k,
        filter: qdrantFilter,
        with_payload: true,
      });

      for (const point of searchResult) {
        const payload = point.payload as unknown as QdrantPayload;

        allResults.push({
          type: "text",
          text: payload.content,
          score: point.score,
          metadata: {
            path: payload.path,
            hash: payload.hash,
          },
          chunk_index: payload.chunk_index,
          generated_metadata: {
            start_line: payload.start_line,
            num_lines: payload.num_lines,
          },
        });
      }
    }

    // Sort by score and take top_k
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    const topResults = allResults.slice(0, top_k);

    return { data: topResults };
  }

  async ask(
    storeIds: string[],
    question: string,
    top_k = 10,
    search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<AskResponse> {
    // First, search for relevant chunks
    const searchResults = await this.search(
      storeIds,
      question,
      top_k,
      search_options,
      filters,
    );

    // Build context from search results
    const context = searchResults.data
      .map((chunk, i) => {
        const path = (chunk.metadata as FileMetadata)?.path || "unknown";
        const startLine = chunk.generated_metadata?.start_line ?? 0;
        return `[Source ${i}: ${path}:${startLine + 1}]\n${chunk.type === "text" ? chunk.text : ""}`;
      })
      .join("\n\n---\n\n");

    // Build prompt for LLM
    const systemPrompt = `You are a helpful assistant that answers questions about code and documents.
Use the provided sources to answer the question. Always cite your sources using <cite i="N" /> tags where N is the source index.
If you cannot find the answer in the sources, say so.`;

    const userPrompt = `Sources:
${context}

Question: ${question}

Answer the question based on the sources above. Cite sources using <cite i="N" /> tags.`;

    // Get answer from LLM
    const response = await this.llm.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return {
      answer: response.content,
      sources: searchResults.data,
    };
  }

  async retrieve(storeId: string): Promise<unknown> {
    const collectionName = this.getCollectionName(storeId);
    return await this.client.getCollection(collectionName);
  }

  async create(options: CreateStoreOptions): Promise<unknown> {
    await this.ensureCollection(options.name);
    return { name: options.name, description: options.description };
  }

  async getInfo(storeId: string): Promise<StoreInfo> {
    const collectionName = this.getCollectionName(storeId);

    try {
      await this.client.getCollection(collectionName);
      return {
        name: storeId,
        description: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        counts: {
          pending: 0, // Qdrant processes immediately
          in_progress: 0,
        },
      };
    } catch {
      return {
        name: storeId,
        description: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        counts: { pending: 0, in_progress: 0 },
      };
    }
  }
}
