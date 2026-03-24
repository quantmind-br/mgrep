import * as fs from "node:fs/promises";
import type {
  AskResponse,
  ChunkType,
  CreateStoreOptions,
  FileMetadata,
  ListFilesOptions,
  SearchFilter,
  SearchResponse,
  Store,
  StoreFile,
  StoreInfo,
  StoreStats,
  TextChunk,
  UploadFileOptions,
} from "./store.js";
import {
  detectLanguage,
  type ExtractedSymbol,
  extractSymbols,
  filterByType,
  isSymbolReference,
  type SymbolType,
  searchByName,
} from "./symbol-extractor.js";

interface TestStoreDB {
  info: StoreInfo;
  files: Record<
    string,
    {
      metadata: FileMetadata;
      content: string;
    }
  >;
}

export class TestStore implements Store {
  path: string;
  private mutex: Promise<void> = Promise.resolve();

  constructor() {
    const path = process.env.MGREP_TEST_STORE_PATH;
    if (!path) {
      throw new Error("MGREP_TEST_STORE_PATH is not set");
    }
    this.path = path;
  }

  private async synchronized<T>(fn: () => Promise<T>): Promise<T> {
    let unlock: () => void = () => {};
    const newLock = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    const previousLock = this.mutex;
    this.mutex = newLock;

    await previousLock;

    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  private async load(): Promise<TestStoreDB> {
    try {
      const content = await fs.readFile(this.path, "utf-8");
      return JSON.parse(content);
    } catch {
      return {
        info: {
          name: "Test Store",
          description: "A test store",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          counts: { pending: 0, in_progress: 0 },
        },
        files: {},
      };
    }
  }

  private async save(data: TestStoreDB): Promise<void> {
    await fs.writeFile(this.path, JSON.stringify(data, null, 2));
  }

  private async readContent(file: File | ReadableStream): Promise<string> {
    if (
      "text" in file &&
      typeof (file as { text: unknown }).text === "function"
    ) {
      return await (file as File).text();
    }

    const chunks: Buffer[] = [];
    if (
      typeof (file as unknown as AsyncIterable<unknown>)[
        Symbol.asyncIterator
      ] === "function"
    ) {
      for await (const chunk of file as unknown as AsyncIterable<
        Uint8Array | string
      >) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf-8");
    }

    if ("getReader" in file) {
      const reader = (file as ReadableStream).getReader();
      const decoder = new TextDecoder();
      let res = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res += decoder.decode(value, { stream: true });
      }
      res += decoder.decode();
      return res;
    }

    throw new Error("Unknown file type");
  }

  async *listFiles(
    _storeId: string,
    options?: ListFilesOptions,
  ): AsyncGenerator<StoreFile> {
    const db = await this.load();
    for (const [external_id, file] of Object.entries(db.files)) {
      if (
        options?.pathPrefix &&
        file.metadata?.path &&
        !file.metadata.path.startsWith(options.pathPrefix)
      ) {
        continue;
      }
      yield {
        external_id,
        metadata: file.metadata,
      };
    }
  }

  async uploadFile(
    _storeId: string,
    file: File | ReadableStream,
    options: UploadFileOptions,
  ): Promise<void> {
    const content = await this.readContent(file);
    await this.synchronized(async () => {
      const db = await this.load();
      db.files[options.external_id] = {
        metadata: options.metadata || { path: options.external_id, hash: "" },
        content,
      };
      await this.save(db);
    });
  }

  async deleteFile(_storeId: string, externalId: string): Promise<void> {
    await this.synchronized(async () => {
      const db = await this.load();
      delete db.files[externalId];
      await this.save(db);
    });
  }

  async search(
    _storeIds: string[],
    query: string,
    top_k?: number,
    search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<SearchResponse> {
    const db = await this.load();
    const results: ChunkType[] = [];
    const limit = top_k || 10;

    for (const file of Object.values(db.files)) {
      if (filters?.all) {
        const pathFilter = filters.all.find(
          (f) => "key" in f && f.key === "path" && f.operator === "starts_with",
        );
        if (
          pathFilter &&
          "value" in pathFilter &&
          file.metadata &&
          !file.metadata.path.startsWith(pathFilter.value as string)
        ) {
          continue;
        }
      }

      const lines = file.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
          const chunk: TextChunk = {
            type: "text",
            text:
              lines[i] + (search_options?.rerank ? "" : " without reranking"),
            score: 1.0 - results.length * 0.01,
            metadata: file.metadata,
            chunk_index: results.length,
            generated_metadata: {
              start_line: i,
              num_lines: 1,
            },
          };
          results.push(chunk);
          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }

    results.sort((a, b) => {
      const pathA = String((a.metadata as FileMetadata)?.path || "");
      const pathB = String((b.metadata as FileMetadata)?.path || "");
      if (pathA !== pathB) return pathA.localeCompare(pathB);
      const lineA = a.generated_metadata?.start_line || 0;
      const lineB = b.generated_metadata?.start_line || 0;
      return lineA - lineB;
    });

    return { data: results };
  }

  async retrieve(_storeId: string): Promise<unknown> {
    const db = await this.load();
    return db.info;
  }

  async create(options: CreateStoreOptions): Promise<unknown> {
    return await this.synchronized(async () => {
      const db = await this.load();
      db.info.name = options.name;
      db.info.description = options.description || "";
      await this.save(db);
      return db.info;
    });
  }

  async ask(
    storeIds: string[],
    question: string,
    top_k?: number,
    search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<AskResponse> {
    const searchRes = await this.search(
      storeIds,
      question,
      top_k,
      search_options,
      filters,
    );
    return {
      answer: 'This is a mock answer from TestStore.<cite i="0" />',
      sources: searchRes.data,
    };
  }

  async getInfo(_storeId: string): Promise<StoreInfo> {
    const db = await this.load();
    return db.info;
  }

  async getStats(_storeId: string): Promise<StoreStats> {
    const db = await this.load();
    const fileCount = Object.keys(db.files).length;
    return {
      store_name: db.info.name,
      description: db.info.description,
      chunk_count: fileCount,
      file_count: fileCount,
      created_at: db.info.created_at,
      updated_at: db.info.updated_at,
    };
  }

  /**
   * Find symbol definitions in the test store.
   *
   * @param _storeId - Store ID (unused in TestStore)
   * @param name - Symbol name to search for
   * @param options - Search options
   * @returns Array of matching symbols with file paths and line numbers
   */
  async findSymbols(
    _storeId: string,
    name: string,
    options?: {
      type?: SymbolType | "any";
      path?: string;
      exact?: boolean;
      maxResults?: number;
    },
  ): Promise<Array<ExtractedSymbol & { path: string }>> {
    const db = await this.load();
    const results: Array<ExtractedSymbol & { path: string }> = [];
    const limit = options?.maxResults || 20;

    for (const [_externalId, file] of Object.entries(db.files)) {
      // Apply path filter
      if (options?.path && !file.metadata.path.startsWith(options.path)) {
        continue;
      }

      // Extract symbols from file content
      const language = detectLanguage(file.metadata.path);
      if (language === "unknown") continue;

      const symbols = extractSymbols(file.content, language);

      // Filter by name
      let filtered = searchByName(symbols, name, options?.exact || false);

      // Filter by type
      if (options?.type && options.type !== "any") {
        filtered = filterByType(filtered, options.type);
      }

      // Add path to each symbol and collect results
      for (const symbol of filtered) {
        results.push({
          ...symbol,
          path: file.metadata.path,
        });

        if (results.length >= limit) break;
      }

      if (results.length >= limit) break;
    }

    // Sort deterministically by path then line number
    results.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.line - b.line;
    });

    return results;
  }

  /**
   * Find all references to a symbol in the test store.
   *
   * @param _storeId - Store ID (unused in TestStore)
   * @param symbol - Symbol name to find references for
   * @param options - Search options
   * @returns Array of references with file paths, line numbers, and context
   */
  async findReferences(
    _storeId: string,
    symbol: string,
    options?: {
      path?: string;
      includeDefinition?: boolean;
      maxResults?: number;
    },
  ): Promise<
    Array<{
      path: string;
      line: number;
      context: string;
      type: "usage" | "definition";
    }>
  > {
    const db = await this.load();
    const results: Array<{
      path: string;
      line: number;
      context: string;
      type: "usage" | "definition";
    }> = [];
    const limit = options?.maxResults || 50;

    // First, find the definition if requested
    let definition: { path: string; line: number; context: string } | undefined;
    if (options?.includeDefinition) {
      const symbols = await this.findSymbols(_storeId, symbol, {
        exact: true,
        maxResults: 1,
      });
      if (symbols.length > 0) {
        const sym = symbols[0];
        const file = Object.values(db.files).find(
          (f) => f.metadata.path === sym.path,
        );
        if (file) {
          const lines = file.content.split("\n");
          definition = {
            path: sym.path,
            line: sym.line,
            context: lines[sym.line - 1] || "",
          };
        }
      }
    }

    // Find all references
    for (const [_externalId, file] of Object.entries(db.files)) {
      // Apply path filter
      if (options?.path && !file.metadata.path.startsWith(options.path)) {
        continue;
      }

      const language = detectLanguage(file.metadata.path);
      if (language === "unknown") continue;

      const lines = file.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isSymbolReference(line, symbol, language)) {
          results.push({
            path: file.metadata.path,
            line: i + 1, // 1-indexed
            context: line,
            type: "usage",
          });

          if (results.length >= limit) break;
        }
      }

      if (results.length >= limit) break;
    }

    // Sort deterministically by path then line number
    results.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.line - b.line;
    });

    // Add definition at the beginning if requested
    if (definition) {
      results.unshift({
        ...definition,
        type: "definition",
      });
    }

    return results;
  }

  /**
   * Seed test data into the store.
   * Useful for setting up test fixtures.
   *
   * @param files - Array of files to seed
   */
  async seedTestData(
    files: Array<{ path: string; content: string; hash?: string }>,
  ): Promise<void> {
    await this.synchronized(async () => {
      const db = await this.load();
      for (const file of files) {
        db.files[file.path] = {
          metadata: {
            path: file.path,
            hash: file.hash || "test-hash",
          },
          content: file.content,
        };
      }
      await this.save(db);
    });
  }

  /**
   * Clear all test data from the store.
   * Useful for cleaning up between tests.
   */
  async clearTestData(): Promise<void> {
    await this.synchronized(async () => {
      const db = await this.load();
      db.files = {};
      await this.save(db);
    });
  }
}
