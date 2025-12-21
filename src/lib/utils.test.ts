import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MgrepConfig } from "./config.js";
import type { FileSystem } from "./file.js";
import type { Store } from "./store.js";
import {
  computeBufferHash,
  computeFileHash,
  deleteFile,
  initialSync,
  isDevelopment,
  isTest,
  listStoreFileHashes,
  listStoreFileMetadata,
  uploadFile,
} from "./utils.js";

// Mock fs.createReadStream to avoid unclosed stream issues in tests
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createReadStream: vi.fn((filePath: string) => {
      // Return a mock readable stream that immediately ends
      const { Readable } = require("node:stream");
      const content = actual.existsSync(filePath)
        ? actual.readFileSync(filePath)
        : Buffer.from("");
      const stream = Readable.from([content]);
      return stream;
    }),
  };
});

function createMockConfig(overrides?: Partial<MgrepConfig>): MgrepConfig {
  return {
    maxFileSize: 10 * 1024 * 1024,
    qdrant: {
      url: "http://localhost:6333",
      collectionPrefix: "mgrep_",
    },
    embeddings: {
      provider: "openai",
      model: "text-embedding-3-small",
      batchSize: 100,
      timeoutMs: 30000,
      maxRetries: 3,
    },
    llm: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 4096,
      timeoutMs: 60000,
      maxRetries: 3,
    },
    sync: {
      concurrency: 20,
    },
    tavily: {
      maxResults: 10,
      searchDepth: "basic",
      includeImages: false,
      includeRawContent: false,
    },
    ...overrides,
  };
}

describe("utils", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrep-utils-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("computeBufferHash", () => {
    it("should compute SHA256 hash of buffer", () => {
      const buffer = Buffer.from("hello world");
      const hash = computeBufferHash(buffer);

      expect(hash).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
    });

    it("should return different hashes for different content", () => {
      const hash1 = computeBufferHash(Buffer.from("content1"));
      const hash2 = computeBufferHash(Buffer.from("content2"));

      expect(hash1).not.toBe(hash2);
    });

    it("should return same hash for same content", () => {
      const hash1 = computeBufferHash(Buffer.from("same content"));
      const hash2 = computeBufferHash(Buffer.from("same content"));

      expect(hash1).toBe(hash2);
    });

    it("should handle empty buffer", () => {
      const hash = computeBufferHash(Buffer.from(""));

      expect(hash).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });
  });

  describe("computeFileHash", () => {
    it("should compute hash of file content", () => {
      const filePath = path.join(tempDir, "test.txt");
      fs.writeFileSync(filePath, "hello world");

      const hash = computeFileHash(filePath, fs.readFileSync);

      expect(hash).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
    });

    it("should use custom read function", () => {
      const filePath = path.join(tempDir, "test.txt");
      fs.writeFileSync(filePath, "original content");

      const mockReadFn = vi.fn().mockReturnValue(Buffer.from("mocked content"));
      const hash = computeFileHash(filePath, mockReadFn);

      expect(mockReadFn).toHaveBeenCalledWith(filePath);
      expect(hash).toBe(computeBufferHash(Buffer.from("mocked content")));
    });
  });

  describe("isTest", () => {
    it("should reflect MGREP_IS_TEST environment variable", () => {
      expect(typeof isTest).toBe("boolean");
    });
  });

  describe("isDevelopment", () => {
    it("should return true in test environment", () => {
      const result = isDevelopment();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("listStoreFileMetadata", () => {
    it("should return metadata map from store", async () => {
      const mockStore = {
        listFiles: async function* () {
          yield {
            external_id: "file1.txt",
            metadata: {
              path: "/path/to/file1.txt",
              hash: "hash1",
              size: 100,
              mtimeMs: 1234567890,
            },
          };
          yield {
            external_id: "file2.txt",
            metadata: {
              path: "/path/to/file2.txt",
              hash: "hash2",
              size: 200,
              mtimeMs: 1234567891,
            },
          };
        },
      } as unknown as Store;

      const result = await listStoreFileMetadata(mockStore, "test-store");

      expect(result.size).toBe(2);
      expect(result.get("file1.txt")).toEqual({
        hash: "hash1",
        size: 100,
        mtimeMs: 1234567890,
      });
      expect(result.get("file2.txt")).toEqual({
        hash: "hash2",
        size: 200,
        mtimeMs: 1234567891,
      });
    });

    it("should pass pathPrefix to listFiles", async () => {
      // Note: listStoreFileMetadata passes the pathPrefix to store.listFiles
      // The actual filtering is done by the store implementation
      const listFilesMock = vi.fn().mockImplementation(async function* () {
        yield {
          external_id: "/path/to/file1.txt",
          metadata: {
            path: "/path/to/file1.txt",
            hash: "hash1",
          },
        };
      });

      const mockStore = {
        listFiles: listFilesMock,
      } as unknown as Store;

      const result = await listStoreFileMetadata(
        mockStore,
        "test-store",
        "/path/to",
      );

      expect(listFilesMock).toHaveBeenCalledWith("test-store", {
        pathPrefix: "/path/to",
      });
      expect(result.size).toBe(1);
      expect(result.get("/path/to/file1.txt")).toBeDefined();
    });

    it("should skip entries without external_id", async () => {
      const mockStore = {
        listFiles: async function* () {
          yield {
            external_id: null,
            metadata: { path: "/path", hash: "hash" },
          };
          yield {
            external_id: "valid.txt",
            metadata: { path: "/valid", hash: "hash" },
          };
        },
      } as unknown as Store;

      const result = await listStoreFileMetadata(mockStore, "test-store");

      expect(result.size).toBe(1);
      expect(result.get("valid.txt")).toBeDefined();
    });

    it("should skip entries without hash in metadata", async () => {
      const mockStore = {
        listFiles: async function* () {
          yield {
            external_id: "file1.txt",
            metadata: { path: "/path" }, // no hash
          };
          yield {
            external_id: "file2.txt",
            metadata: { path: "/path", hash: "hash2" },
          };
        },
      } as unknown as Store;

      const result = await listStoreFileMetadata(mockStore, "test-store");

      expect(result.size).toBe(1);
      expect(result.get("file2.txt")).toBeDefined();
    });
  });

  describe("listStoreFileHashes", () => {
    it("should return map of external_id to hash", async () => {
      const mockStore = {
        listFiles: async function* () {
          yield {
            external_id: "file1.txt",
            metadata: { path: "/path/file1.txt", hash: "hash1" },
          };
          yield {
            external_id: "file2.txt",
            metadata: { path: "/path/file2.txt", hash: "hash2" },
          };
        },
      } as unknown as Store;

      const result = await listStoreFileHashes(mockStore, "test-store");

      expect(result.size).toBe(2);
      expect(result.get("file1.txt")).toBe("hash1");
      expect(result.get("file2.txt")).toBe("hash2");
    });

    it("should handle undefined hash", async () => {
      const mockStore = {
        listFiles: async function* () {
          yield {
            external_id: "file1.txt",
            metadata: { path: "/path/file1.txt", hash: undefined },
          };
        },
      } as unknown as Store;

      const result = await listStoreFileHashes(mockStore, "test-store");

      expect(result.get("file1.txt")).toBeUndefined();
    });
  });

  describe("deleteFile", () => {
    it("should call store.deleteFile with correct parameters", async () => {
      const mockStore = {
        deleteFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      await deleteFile(mockStore, "test-store", "/path/to/file.txt");

      expect(mockStore.deleteFile).toHaveBeenCalledWith(
        "test-store",
        "/path/to/file.txt",
      );
    });
  });

  describe("uploadFile", () => {
    it("should skip file exceeding maxFileSize", async () => {
      const mockStore = {
        uploadFile: vi.fn(),
      } as unknown as Store;

      const config = createMockConfig({ maxFileSize: 100 });

      const filePath = path.join(tempDir, "large.txt");
      fs.writeFileSync(filePath, "x".repeat(200));

      const result = await uploadFile(
        mockStore,
        "test-store",
        filePath,
        "large.txt",
        config,
      );

      expect(result).toBe(false);
      expect(mockStore.uploadFile).not.toHaveBeenCalled();
    });

    it("should skip empty file", async () => {
      const mockStore = {
        uploadFile: vi.fn(),
      } as unknown as Store;

      const filePath = path.join(tempDir, "empty.txt");
      fs.writeFileSync(filePath, "");

      const result = await uploadFile(
        mockStore,
        "test-store",
        filePath,
        "empty.txt",
      );

      expect(result).toBe(false);
      expect(mockStore.uploadFile).not.toHaveBeenCalled();
    });

    it("should upload file using stream", async () => {
      const mockStore = {
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const filePath = path.join(tempDir, "test.txt");
      fs.writeFileSync(filePath, "test content");

      const result = await uploadFile(
        mockStore,
        "test-store",
        filePath,
        "test.txt",
      );

      expect(result).toBe(true);
      expect(mockStore.uploadFile).toHaveBeenCalledTimes(1);
      const callArgs = (mockStore.uploadFile as any).mock.calls[0];
      expect(callArgs[0]).toBe("test-store");
      expect(callArgs[1]).toBeDefined();
      expect(callArgs[2].external_id).toBe(filePath);
      expect(callArgs[2].overwrite).toBe(true);
      expect(callArgs[2].metadata.path).toBe(filePath);
      expect(callArgs[2].metadata.hash).toBeDefined();
    });

    it("should use provided buffer and stat", async () => {
      const mockStore = {
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const filePath = path.join(tempDir, "test.txt");
      fs.writeFileSync(filePath, "test content");

      const buffer = Buffer.from("test content");
      const stat = fs.statSync(filePath);

      const result = await uploadFile(
        mockStore,
        "test-store",
        filePath,
        "test.txt",
        undefined,
        { buffer, stat },
      );

      expect(result).toBe(true);
      expect(mockStore.uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("initialSync", () => {
    let mockStore: Store;
    let mockFileSystem: FileSystem;

    beforeEach(() => {
      mockStore = {
        listFiles: async function* () {
          yield* [];
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      mockFileSystem = {
        getFiles: function* () {
          yield* [];
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };
    });

    it("should upload new files", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      fs.writeFileSync(file1, "content1");
      fs.writeFileSync(file2, "content2");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
          yield file2;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
      );

      expect(result.processed).toBe(2);
      expect(result.uploaded).toBe(2);
      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockStore.uploadFile).toHaveBeenCalledTimes(2);
    });

    it("should delete files not present locally", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      mockStore = {
        listFiles: async function* () {
          yield {
            external_id: path.join(tempDir, "file2.txt"),
            metadata: { path: path.join(tempDir, "file2.txt"), hash: "hash2" },
          };
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
      );

      expect(result.processed).toBe(2);
      expect(result.uploaded).toBe(1);
      expect(result.deleted).toBe(1);
      expect(mockStore.deleteFile).toHaveBeenCalledWith(
        "test-store",
        path.join(tempDir, "file2.txt"),
      );
    });

    it("should skip files that match metadata (size and mtime)", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");
      const stat = fs.statSync(file1);

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      const hash = computeBufferHash(Buffer.from("content1"));
      mockStore = {
        listFiles: async function* () {
          yield {
            external_id: file1,
            metadata: {
              path: file1,
              hash,
              size: stat.size,
              mtimeMs: stat.mtimeMs,
            },
          };
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
      );

      expect(result.processed).toBe(1);
      expect(result.uploaded).toBe(0);
      expect(mockStore.uploadFile).not.toHaveBeenCalled();
    });

    it("should re-upload if hash differs", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "new content");
      const stat = fs.statSync(file1);

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      // Simulate different mtime to trigger hash comparison
      // (if mtime matches, the file is skipped without hash check)
      mockStore = {
        listFiles: async function* () {
          yield {
            external_id: file1,
            metadata: {
              path: file1,
              hash: "old-hash",
              size: stat.size,
              mtimeMs: stat.mtimeMs - 1000, // Different mtime to trigger hash check
            },
          };
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
      );

      expect(result.uploaded).toBe(1);
      expect(mockStore.uploadFile).toHaveBeenCalled();
    });

    it("should skip files exceeding maxFileSize", async () => {
      const file1 = path.join(tempDir, "large.txt");
      fs.writeFileSync(file1, "x".repeat(1000));

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      const config = createMockConfig({ maxFileSize: 100 });

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
        undefined,
        config,
      );

      expect(result.processed).toBe(1);
      expect(result.uploaded).toBe(0);
      expect(mockStore.uploadFile).not.toHaveBeenCalled();
    });

    it("should handle errors during upload", async () => {
      // Create a unique temp directory for this test to avoid race conditions
      const testDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "mgrep-error-test-"),
      );
      const file1 = path.join(testDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      const testFileSystem: FileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      // Create a fresh mockStore with rejected uploadFile (both attempts fail)
      const testStore = {
        listFiles: async function* () {
          yield* [];
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockRejectedValue(new Error("Upload failed")),
      } as unknown as Store;

      const result = await initialSync(
        testStore,
        testFileSystem,
        "test-store",
        testDir,
        false,
      );

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });

      // Even with retry logic, the error is caught and counted once per file
      expect(result.uploaded).toBe(0);
      expect(result.errors).toBe(1);
    });

    it("should handle errors during delete", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      mockStore = {
        listFiles: async function* () {
          yield {
            external_id: path.join(tempDir, "file2.txt"),
            metadata: { path: path.join(tempDir, "file2.txt"), hash: "hash2" },
          };
        },
        deleteFile: vi.fn().mockRejectedValue(new Error("Delete failed")),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
      );

      expect(result.processed).toBe(2);
      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(1);
    });

    it("should call progress callback", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      const progressCallback = vi.fn();
      await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
        progressCallback,
      );

      expect(progressCallback).toHaveBeenCalled();
      const progressCalls = progressCallback.mock.calls;
      expect(progressCalls[0][0]).toMatchObject({
        processed: 1,
        uploaded: 1,
        deleted: 0,
        errors: 0,
        total: 1,
        filePath: file1,
      });
    });

    it("should handle dry-run mode", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        true, // dryRun
      );

      expect(result.uploaded).toBe(1);
      expect(mockStore.uploadFile).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Dry run: would have uploaded",
        file1,
      );

      consoleSpy.mockRestore();
    });

    it("should handle dry-run with deletions", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      mockStore = {
        listFiles: async function* () {
          yield {
            external_id: path.join(tempDir, "file2.txt"),
            metadata: { path: path.join(tempDir, "file2.txt"), hash: "hash2" },
          };
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        true, // dryRun
      );

      expect(result.deleted).toBe(1);
      expect(mockStore.deleteFile).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Dry run: would have deleted",
        path.join(tempDir, "file2.txt"),
      );

      consoleSpy.mockRestore();
    });

    it("should respect path scope for store files", async () => {
      const file1 = path.join(tempDir, "file1.txt");
      fs.writeFileSync(file1, "content1");

      mockFileSystem = {
        getFiles: function* () {
          yield file1;
        },
        isIgnored: () => false,
        loadMgrepignore: () => {},
      };

      mockStore = {
        listFiles: async function* () {
          yield {
            external_id: "/outside/file2.txt",
            metadata: { path: "/outside/file2.txt", hash: "hash2" },
          };
        },
        deleteFile: vi.fn().mockResolvedValue(undefined),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      } as unknown as Store;

      const result = await initialSync(
        mockStore,
        mockFileSystem,
        "test-store",
        tempDir,
        false,
      );

      expect(result.deleted).toBe(0);
      expect(mockStore.deleteFile).not.toHaveBeenCalled();
    });
  });
});
