import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock config module first
vi.mock("./config.js", () => ({
  loadConfig: vi.fn(() => ({
    qdrant: {
      url: "http://localhost:6333",
      apiKey: "test-key",
      collectionPrefix: "test",
    },
    embeddings: {
      provider: "openai",
      model: "text-embedding-3-small",
      apiKey: "test-embed-key",
    },
    llm: {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "test-llm-key",
    },
    tavily: {
      apiKey: "test-tavily-key",
      maxResults: 10,
      searchDepth: "basic",
      includeImages: false,
      includeRawContent: false,
    },
  })),
}));

// Mock QdrantStore to avoid actual network calls
vi.mock("./qdrant-store.js", () => ({
  QdrantStore: class {
    listFiles = vi.fn();
    uploadFile = vi.fn();
    deleteFile = vi.fn();
    search = vi.fn();
    ask = vi.fn();
    retrieve = vi.fn();
    create = vi.fn();
    getInfo = vi.fn();
  },
}));

// Mock providers
vi.mock("./providers/index.js", () => ({
  createEmbeddingsClient: vi.fn(() => ({
    embed: vi.fn(),
    embedBatch: vi.fn(),
    getDimensions: vi.fn(),
  })),
  createLLMClient: vi.fn(() => ({
    chat: vi.fn(),
    chatStream: vi.fn(),
  })),
}));

// Import after mocks
import {
  createFileSystem,
  createGit,
  createWebSearchClientFromConfig,
} from "./context.js";
import { NodeFileSystem } from "./file.js";
import { NodeGit } from "./git.js";
import { TavilyClient } from "./providers/web/tavily.js";

describe("context", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("createStore", () => {
    it("should return TestStore when MGREP_IS_TEST=1", async () => {
      // Set env before importing
      process.env.MGREP_IS_TEST = "1";
      process.env.MGREP_TEST_STORE_PATH = "/tmp/test-store.json";

      // Clear the module cache and re-import
      vi.resetModules();
      const { createStore } = await import("./context.js");
      const { TestStore } = await import("./store.js");

      const store = await createStore();

      expect(store).toBeInstanceOf(TestStore);
    });

    it("should return QdrantStore when not in test mode", async () => {
      delete process.env.MGREP_IS_TEST;

      vi.resetModules();
      const { createStore } = await import("./context.js");
      const { QdrantStore } = await import("./qdrant-store.js");
      const { TestStore } = await import("./store.js");

      const store = await createStore();

      expect(store).toBeDefined();
      expect(store).not.toBeInstanceOf(TestStore);
      expect(store).toBeInstanceOf(QdrantStore);
    });

    it("should call createEmbeddingsClient with config", async () => {
      delete process.env.MGREP_IS_TEST;

      vi.resetModules();
      const { createStore } = await import("./context.js");
      const { createEmbeddingsClient } = await import("./providers/index.js");

      await createStore();

      expect(createEmbeddingsClient).toHaveBeenCalled();
    });

    it("should call createLLMClient with config", async () => {
      delete process.env.MGREP_IS_TEST;

      vi.resetModules();
      const { createStore } = await import("./context.js");
      const { createLLMClient } = await import("./providers/index.js");

      await createStore();

      expect(createLLMClient).toHaveBeenCalled();
    });
  });

  describe("createGit", () => {
    it("should return NodeGit instance", () => {
      const git = createGit();

      expect(git).toBeInstanceOf(NodeGit);
    });

    it("should return new instance each time", () => {
      const git1 = createGit();
      const git2 = createGit();

      expect(git1).not.toBe(git2);
    });
  });

  describe("createFileSystem", () => {
    it("should return NodeFileSystem instance", () => {
      const fs = createFileSystem();

      expect(fs).toBeInstanceOf(NodeFileSystem);
    });

    it("should accept custom ignore patterns", () => {
      const fs = createFileSystem({
        ignorePatterns: ["*.log", "*.tmp"],
      });

      expect(fs).toBeInstanceOf(NodeFileSystem);
    });

    it("should use empty ignore patterns by default", () => {
      const fs = createFileSystem();

      expect(fs).toBeInstanceOf(NodeFileSystem);
    });

    it("should pass git instance to NodeFileSystem", () => {
      const fs = createFileSystem();

      expect(fs).toBeInstanceOf(NodeFileSystem);
    });
  });

  describe("createWebSearchClientFromConfig", () => {
    it("should create TavilyClient with config", () => {
      const client = createWebSearchClientFromConfig({
        apiKey: "test-api-key",
        maxResults: 10,
        searchDepth: "basic",
        includeImages: false,
        includeRawContent: false,
      });

      expect(client).toBeInstanceOf(TavilyClient);
    });

    it("should pass all config options to client", () => {
      const config = {
        apiKey: "test-api-key",
        maxResults: 20,
        searchDepth: "advanced" as const,
        includeImages: true,
        includeRawContent: true,
      };

      const client = createWebSearchClientFromConfig(config);

      expect(client).toBeInstanceOf(TavilyClient);
    });

    it("should throw if apiKey is missing and no env var", () => {
      delete process.env.MGREP_TAVILY_API_KEY;

      expect(() =>
        createWebSearchClientFromConfig({
          apiKey: undefined,
          maxResults: 10,
          searchDepth: "basic",
          includeImages: false,
          includeRawContent: false,
        }),
      ).toThrow("Tavily API key is required");
    });

    it("should use env var when apiKey is undefined", () => {
      process.env.MGREP_TAVILY_API_KEY = "env-api-key";

      const client = createWebSearchClientFromConfig({
        apiKey: undefined,
        maxResults: 10,
        searchDepth: "basic",
        includeImages: false,
        includeRawContent: false,
      });

      expect(client).toBeInstanceOf(TavilyClient);
    });
  });
});
