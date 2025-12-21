import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestStore } from "./store.js";

describe("TestStore", () => {
  let tempDir: string;
  let storePath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrep-store-test-"));
    storePath = path.join(tempDir, "test-store.json");
    originalEnv = process.env.MGREP_TEST_STORE_PATH;
    process.env.MGREP_TEST_STORE_PATH = storePath;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env.MGREP_TEST_STORE_PATH = originalEnv;
    } else {
      delete process.env.MGREP_TEST_STORE_PATH;
    }
  });

  describe("constructor", () => {
    it("should throw error if MGREP_TEST_STORE_PATH is not set", () => {
      delete process.env.MGREP_TEST_STORE_PATH;

      expect(() => new TestStore()).toThrow("MGREP_TEST_STORE_PATH is not set");
    });

    it("should create store with valid path", () => {
      const store = new TestStore();

      expect(store.path).toBe(storePath);
    });
  });

  describe("create", () => {
    it("should create a new store", async () => {
      const store = new TestStore();

      await store.create({
        name: "test-store",
        description: "Test description",
      });

      const info = await store.getInfo("test-store");
      expect(info.name).toBe("test-store");
      expect(info.description).toBe("Test description");
    });
  });

  describe("uploadFile and listFiles", () => {
    it("should upload and list files", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });
      await store.uploadFile("test", file, {
        external_id: "/path/to/test.txt",
        metadata: { path: "/path/to/test.txt", hash: "abc123" },
      });

      const files: Array<{ external_id: string | null }> = [];
      for await (const f of store.listFiles("test")) {
        files.push(f);
      }

      expect(files).toHaveLength(1);
      expect(files[0].external_id).toBe("/path/to/test.txt");
    });

    it("should filter files by path prefix", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile("test", new File(["content1"], "file1.txt"), {
        external_id: "/src/file1.txt",
        metadata: { path: "/src/file1.txt", hash: "hash1" },
      });
      await store.uploadFile("test", new File(["content2"], "file2.txt"), {
        external_id: "/lib/file2.txt",
        metadata: { path: "/lib/file2.txt", hash: "hash2" },
      });

      const srcFiles: Array<{ external_id: string | null }> = [];
      for await (const f of store.listFiles("test", { pathPrefix: "/src" })) {
        srcFiles.push(f);
      }

      expect(srcFiles).toHaveLength(1);
      expect(srcFiles[0].external_id).toBe("/src/file1.txt");
    });

    it("should upload file from Node.js ReadableStream", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      // Create a Node.js ReadableStream
      const stream = Readable.from(["chunk1", " ", "chunk2"]);

      await store.uploadFile("test", stream as any, {
        external_id: "/stream/file.txt",
        metadata: { path: "/stream/file.txt", hash: "stream-hash" },
      });

      const files: Array<{ external_id: string | null }> = [];
      for await (const f of store.listFiles("test")) {
        files.push(f);
      }

      expect(files).toHaveLength(1);
      expect(files[0].external_id).toBe("/stream/file.txt");
    });

    it("should upload file from Web ReadableStream", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      // Create a Web ReadableStream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("web"));
          controller.enqueue(encoder.encode(" "));
          controller.enqueue(encoder.encode("content"));
          controller.close();
        },
      });

      await store.uploadFile("test", stream, {
        external_id: "/web/file.txt",
        metadata: { path: "/web/file.txt", hash: "web-hash" },
      });

      const files: Array<{ external_id: string | null }> = [];
      for await (const f of store.listFiles("test")) {
        files.push(f);
      }

      expect(files).toHaveLength(1);
      expect(files[0].external_id).toBe("/web/file.txt");
    });

    it("should throw error for unknown file type", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      // Create an object that's not a File, ReadableStream, or AsyncIterable
      const unknownFile = { unknown: "type" } as unknown as File;

      await expect(
        store.uploadFile("test", unknownFile, {
          external_id: "/unknown/file.txt",
          metadata: { path: "/unknown/file.txt", hash: "unknown-hash" },
        }),
      ).rejects.toThrow("Unknown file type");
    });
  });

  describe("deleteFile", () => {
    it("should delete a file from the store", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile("test", new File(["content"], "file.txt"), {
        external_id: "/path/file.txt",
        metadata: { path: "/path/file.txt", hash: "hash" },
      });

      await store.deleteFile("test", "/path/file.txt");

      const files: Array<{ external_id: string | null }> = [];
      for await (const f of store.listFiles("test")) {
        files.push(f);
      }

      expect(files).toHaveLength(0);
    });
  });

  describe("search", () => {
    it("should search for matching content", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile(
        "test",
        new File(["hello world\nfoo bar"], "file.txt"),
        {
          external_id: "/file.txt",
          metadata: { path: "/file.txt", hash: "hash" },
        },
      );

      const results = await store.search(["test"], "hello");

      expect(results.data).toHaveLength(1);
      expect(results.data[0].type).toBe("text");
      expect((results.data[0] as { text: string }).text).toContain("hello");
    });

    it("should respect top_k limit", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile(
        "test",
        new File(["test line 1\ntest line 2\ntest line 3"], "file.txt"),
        {
          external_id: "/file.txt",
          metadata: { path: "/file.txt", hash: "hash" },
        },
      );

      const results = await store.search(["test"], "test", 2);

      expect(results.data.length).toBeLessThanOrEqual(2);
    });

    it("should filter by path prefix", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile(
        "test",
        new File(["searchable content"], "src.txt"),
        {
          external_id: "/src/file.txt",
          metadata: { path: "/src/file.txt", hash: "hash1" },
        },
      );
      await store.uploadFile(
        "test",
        new File(["searchable content"], "lib.txt"),
        {
          external_id: "/lib/file.txt",
          metadata: { path: "/lib/file.txt", hash: "hash2" },
        },
      );

      const results = await store.search(
        ["test"],
        "searchable",
        10,
        undefined,
        {
          all: [{ key: "path", operator: "starts_with", value: "/src" }],
        },
      );

      expect(results.data).toHaveLength(1);
    });

    it("should return empty results when no matches", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile("test", new File(["content"], "file.txt"), {
        external_id: "/file.txt",
        metadata: { path: "/file.txt", hash: "hash" },
      });

      const results = await store.search(["test"], "nonexistent");

      expect(results.data).toHaveLength(0);
    });

    it("should handle rerank option", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile("test", new File(["test content"], "file.txt"), {
        external_id: "/file.txt",
        metadata: { path: "/file.txt", hash: "hash" },
      });

      const results = await store.search(["test"], "test", 10, {
        rerank: true,
      });

      expect(results.data).toHaveLength(1);
      // With rerank, the text should NOT have " without reranking" suffix
      expect((results.data[0] as { text: string }).text).not.toContain(
        "without reranking",
      );
    });
  });

  describe("ask", () => {
    it("should return a mock answer with sources", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile(
        "test",
        new File(["relevant content for question"], "file.txt"),
        {
          external_id: "/file.txt",
          metadata: { path: "/file.txt", hash: "hash" },
        },
      );

      const result = await store.ask(["test"], "question");

      expect(result.answer).toContain("mock answer");
      expect(result.sources).toBeDefined();
    });

    it("should return empty sources when no matches", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      const result = await store.ask(["test"], "nonexistent question");

      expect(result.answer).toContain("mock answer");
      expect(result.sources).toHaveLength(0);
    });
  });

  describe("retrieve", () => {
    it("should retrieve store info", async () => {
      const store = new TestStore();
      await store.create({ name: "my-store", description: "My description" });

      const info = await store.retrieve("my-store");

      expect(info).toBeDefined();
    });
  });

  describe("getInfo", () => {
    it("should return store info with counts", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      const info = await store.getInfo("test");

      expect(info.name).toBe("test");
      expect(info.counts).toBeDefined();
      expect(info.counts.pending).toBe(0);
      expect(info.counts.in_progress).toBe(0);
    });

    it("should return info for store with files", async () => {
      const store = new TestStore();
      await store.create({ name: "test" });

      await store.uploadFile("test", new File(["content"], "file.txt"), {
        external_id: "/file.txt",
        metadata: { path: "/file.txt", hash: "hash" },
      });

      const info = await store.getInfo("test");

      expect(info.name).toBe("test");
      expect(info.counts).toBeDefined();
    });
  });
});
