import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingsClient, LLMClient } from "./providers/types.js";
import { QdrantStore } from "./qdrant-store.js";

// Create mock client instance that will be shared
const mockQdrantClient = {
  getCollection: vi.fn(),
  createCollection: vi.fn(),
  createPayloadIndex: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  scroll: vi.fn(),
  search: vi.fn(),
};

// Mock QdrantClient as a class
vi.mock("@qdrant/js-client-rest", () => {
  return {
    QdrantClient: vi.fn().mockImplementation(function () {
      Object.assign(this, mockQdrantClient);
    }),
  };
});

describe("qdrant-store", () => {
  let mockEmbeddings: EmbeddingsClient;
  let mockLLM: LLMClient;
  let store: QdrantStore;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockQdrantClient.getCollection.mockReset();
    mockQdrantClient.createCollection.mockReset();
    mockQdrantClient.createPayloadIndex.mockReset();
    mockQdrantClient.upsert.mockReset();
    mockQdrantClient.delete.mockReset();
    mockQdrantClient.scroll.mockReset();
    mockQdrantClient.search.mockReset();

    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue({ embedding: new Array(384).fill(0.1) }),
      embedBatch: vi
        .fn()
        .mockResolvedValue([{ embedding: new Array(384).fill(0.1) }]),
      getDimensions: vi.fn().mockResolvedValue(384),
    };

    mockLLM = {
      chat: vi.fn().mockResolvedValue({ content: "test response" }),
      chatStream: vi.fn(),
    };

    store = new QdrantStore({
      url: "http://localhost:6333",
      embeddingsClient: mockEmbeddings,
      llmClient: mockLLM,
      collectionPrefix: "test_",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should parse URL correctly", () => {
      const customStore = new QdrantStore({
        url: "https://custom-host:9999",
        embeddingsClient: mockEmbeddings,
        llmClient: mockLLM,
      });

      expect(customStore).toBeDefined();
    });

    it("should use default collection prefix", () => {
      const customStore = new QdrantStore({
        url: "http://localhost:6333",
        embeddingsClient: mockEmbeddings,
        llmClient: mockLLM,
      });

      expect(customStore).toBeDefined();
    });
  });

  describe("uploadFile", () => {
    it("should chunk and upload file content", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockRejectedValueOnce(
        new Error("Not found"),
      );
      (mockClient.createCollection as any).mockResolvedValue({});
      (mockClient.createPayloadIndex as any).mockResolvedValue({});
      (mockClient.upsert as any).mockResolvedValue({});

      // Create a small file content
      const content = "line1\nline2\nline3";
      const file = new File([content], "test.txt", { type: "text/plain" });

      await store.uploadFile("test-store", file, {
        external_id: "/path/to/test.txt",
        metadata: { path: "/path/to/test.txt", hash: "abc123" },
      });

      expect(mockEmbeddings.embedBatch).toHaveBeenCalled();
    });

    it("should delete existing file before overwriting", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.delete as any).mockResolvedValue({});
      (mockClient.upsert as any).mockResolvedValue({});

      const content = "test content";
      const file = new File([content], "test.txt", { type: "text/plain" });

      await store.uploadFile("test-store", file, {
        external_id: "/path/to/test.txt",
        overwrite: true,
      });

      expect(mockClient.delete).toHaveBeenCalled();
    });

    it("should handle whitespace-only files by creating one chunk", async () => {
      const file = new File(["   "], "whitespace.txt", { type: "text/plain" });

      mockQdrantClient.getCollection.mockResolvedValue({});
      mockQdrantClient.delete.mockResolvedValue({});
      mockQdrantClient.upsert.mockResolvedValue({});

      await store.uploadFile("test-store", file, {
        external_id: "/path/to/whitespace.txt",
      });

      expect(mockQdrantClient.upsert).toHaveBeenCalled();
    });

    it("should chunk large files correctly", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.delete as any).mockResolvedValue({});
      (mockClient.upsert as any).mockResolvedValue({});

      // Create content with more than 50 lines (chunk size)
      const lines = Array(100).fill("line content").join("\n");
      const file = new File([lines], "large.txt", { type: "text/plain" });

      (mockEmbeddings.embedBatch as any).mockResolvedValue(
        Array(3).fill({ embedding: new Array(384).fill(0.1) }),
      );

      await store.uploadFile("test-store", file, {
        external_id: "/path/to/large.txt",
      });

      // Should create multiple chunks
      expect(mockEmbeddings.embedBatch).toHaveBeenCalled();
      const embedBatchCall = (mockEmbeddings.embedBatch as any).mock.calls[0];
      expect(embedBatchCall[0].length).toBeGreaterThan(1);
    });

    it("should upload file from Node.js ReadableStream", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.delete as any).mockResolvedValue({});
      (mockClient.upsert as any).mockResolvedValue({});

      // Create a Node.js ReadableStream
      const stream = Readable.from(["line1\n", "line2\n", "line3"]);

      await store.uploadFile("test-store", stream as any, {
        external_id: "/path/to/stream.txt",
        metadata: { path: "/path/to/stream.txt", hash: "stream-hash" },
      });

      expect(mockEmbeddings.embedBatch).toHaveBeenCalled();
    });

    it("should handle empty file by creating one empty chunk", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.delete as any).mockResolvedValue({});
      (mockClient.upsert as any).mockResolvedValue({});

      const file = new File([""], "empty.txt", { type: "text/plain" });

      await store.uploadFile("test-store", file, {
        external_id: "/path/to/empty.txt",
      });

      // Empty file creates one chunk with empty text
      expect(mockClient.upsert).toHaveBeenCalled();
    });

    it("should handle file with only newlines", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.delete as any).mockResolvedValue({});
      (mockClient.upsert as any).mockResolvedValue({});

      const file = new File(["\n\n\n"], "newlines.txt", { type: "text/plain" });

      await store.uploadFile("test-store", file, {
        external_id: "/path/to/newlines.txt",
      });

      // File with only newlines creates empty chunks which are skipped
      expect(mockClient.upsert).toHaveBeenCalled();
    });
  });

  describe("deleteFile", () => {
    it("should delete file by external_id", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.delete as any).mockResolvedValue({});

      await store.deleteFile("test-store", "/path/to/file.txt");

      expect(mockClient.delete).toHaveBeenCalledWith(
        "test_test-store",
        expect.objectContaining({
          wait: true,
          filter: {
            must: [
              {
                key: "external_id",
                match: { value: "/path/to/file.txt" },
              },
            ],
          },
        }),
      );
    });

    it("should handle non-existent collection gracefully", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.delete as any).mockRejectedValue(new Error("Not found"));

      await expect(
        store.deleteFile("test-store", "/path/to/file.txt"),
      ).resolves.not.toThrow();
    });
  });

  describe("listFiles", () => {
    it("should list files with pagination", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.scroll as any).mockResolvedValue({
        points: [
          {
            payload: {
              external_id: "/file1.txt",
              path: "/file1.txt",
              hash: "hash1",
            },
          },
        ],
        next_page_offset: null,
      });

      const files = [];
      for await (const file of store.listFiles("test-store")) {
        files.push(file);
      }

      expect(files).toHaveLength(1);
      expect(files[0].external_id).toBe("/file1.txt");
    });

    it("should return empty for non-existent collection", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockRejectedValue(
        new Error("Not found"),
      );

      const files = [];
      for await (const file of store.listFiles("test-store")) {
        files.push(file);
      }

      expect(files).toHaveLength(0);
    });

    it("should filter by path prefix", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.scroll as any).mockResolvedValue({
        points: [
          {
            payload: {
              external_id: "/src/file1.txt",
              path: "/src/file1.txt",
              hash: "hash1",
            },
          },
        ],
        next_page_offset: null,
      });

      const files = [];
      for await (const file of store.listFiles("test-store", {
        pathPrefix: "/src",
      })) {
        files.push(file);
      }

      expect(files).toHaveLength(1);
    });

    it("should handle pagination with multiple pages", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});

      let callCount = 0;
      (mockClient.scroll as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            points: [
              {
                payload: {
                  external_id: "/file1.txt",
                  path: "/file1.txt",
                  hash: "hash1",
                },
              },
            ],
            next_page_offset: "offset1",
          });
        }
        return Promise.resolve({
          points: [
            {
              payload: {
                external_id: "/file2.txt",
                path: "/file2.txt",
                hash: "hash2",
              },
            },
          ],
          next_page_offset: null,
        });
      });

      const files = [];
      for await (const file of store.listFiles("test-store")) {
        files.push(file);
      }

      expect(files).toHaveLength(2);
      expect(callCount).toBe(2);
    });

    it("should deduplicate files with multiple chunks", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.scroll as any).mockResolvedValue({
        points: [
          {
            payload: {
              external_id: "/file.txt",
              path: "/file.txt",
              hash: "hash1",
            },
          },
          {
            payload: {
              external_id: "/file.txt", // Same file, different chunk
              path: "/file.txt",
              hash: "hash1",
            },
          },
        ],
        next_page_offset: null,
      });

      const files = [];
      for await (const file of store.listFiles("test-store")) {
        files.push(file);
      }

      expect(files).toHaveLength(1);
    });
  });

  describe("search", () => {
    it("should search and return results", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.search as any).mockResolvedValue([
        {
          payload: {
            external_id: "/file.txt",
            path: "/file.txt",
            hash: "hash1",
            content: "test content",
            chunk_index: 0,
            start_line: 0,
            num_lines: 1,
          },
          score: 0.95,
        },
      ]);

      const result = await store.search(["test-store"], "test");

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe("text");
    });

    it("should filter by path prefix", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.search as any).mockResolvedValue([
        {
          payload: {
            external_id: "/src/file.txt",
            path: "/src/file.txt",
            hash: "hash1",
            content: "test",
            chunk_index: 0,
            start_line: 0,
            num_lines: 1,
          },
          score: 0.95,
        },
      ]);

      const result = await store.search(["test-store"], "test", 10, undefined, {
        all: [{ key: "path", operator: "starts_with", value: "/src" }],
      });

      expect(result.data).toHaveLength(1);
    });

    it("should skip non-existent collections", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockRejectedValue(
        new Error("Not found"),
      );

      const result = await store.search(["test-store"], "test");

      expect(result.data).toHaveLength(0);
    });

    it("should handle multiple store IDs", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.search as any).mockResolvedValue([
        {
          payload: {
            external_id: "/file.txt",
            path: "/file.txt",
            hash: "hash1",
            content: "test",
            chunk_index: 0,
            start_line: 0,
            num_lines: 1,
          },
          score: 0.95,
        },
      ]);

      const result = await store.search(["store1", "store2"], "test");

      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe("ask", () => {
    it("should search and get answer from LLM", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.search as any).mockResolvedValue([
        {
          payload: {
            external_id: "/file.txt",
            path: "/file.txt",
            hash: "hash1",
            content: "relevant content",
            chunk_index: 0,
            start_line: 0,
            num_lines: 1,
          },
          score: 0.95,
        },
      ]);

      const result = await store.ask(["test-store"], "question");

      expect(result.answer).toBe("test response");
      expect(result.sources).toHaveLength(1);
    });

    it("should handle empty search results", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});
      (mockClient.search as any).mockResolvedValue([]);

      const result = await store.ask(["test-store"], "question");

      expect(result.answer).toBe("test response");
      expect(result.sources).toHaveLength(0);
    });
  });

  describe("create", () => {
    it("should create a new store", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockRejectedValueOnce(
        new Error("Not found"),
      );
      (mockClient.createCollection as any).mockResolvedValue({});
      (mockClient.createPayloadIndex as any).mockResolvedValue({});

      const result = await store.create({
        name: "new-store",
        description: "Test store",
      });

      expect(result).toEqual({
        name: "new-store",
        description: "Test store",
      });
    });
  });

  describe("retrieve", () => {
    it("should retrieve collection info", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({
        vectors_count: 100,
        points_count: 100,
      });

      const result = await store.retrieve("test-store");

      expect(result).toBeDefined();
    });
  });

  describe("getInfo", () => {
    it("should return store info for existing collection", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockResolvedValue({});

      const info = await store.getInfo("test-store");

      expect(info.name).toBe("test-store");
      expect(info.counts.pending).toBe(0);
      expect(info.counts.in_progress).toBe(0);
    });

    it("should return default info for non-existent collection", async () => {
      const { QdrantClient } = await import("@qdrant/js-client-rest");
      const mockClient = new QdrantClient({});
      (mockClient.getCollection as any).mockRejectedValue(
        new Error("Not found"),
      );

      const info = await store.getInfo("nonexistent");

      expect(info.name).toBe("nonexistent");
      expect(info.counts.pending).toBe(0);
    });
  });
});
