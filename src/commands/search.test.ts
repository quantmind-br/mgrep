import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies
vi.mock("../lib/context.js", () => ({
  createFileSystem: vi.fn(),
  createStore: vi.fn(),
  createWebSearchClientFromConfig: vi.fn(),
}));

vi.mock("../lib/config.js", () => ({
  loadConfig: vi.fn(() => ({
    qdrant: {
      url: "http://localhost:6333",
      apiKey: "test",
      collectionPrefix: "test",
    },
    embeddings: {
      provider: "openai",
      model: "text-embedding-3-small",
      apiKey: "test",
    },
    llm: { provider: "openai", model: "gpt-4o-mini", apiKey: "test" },
    tavily: {
      apiKey: "test-tavily",
      maxResults: 10,
      searchDepth: "basic",
      includeImages: false,
      includeRawContent: false,
    },
  })),
}));

vi.mock("../lib/utils.js", () => ({
  initialSync: vi.fn(() =>
    Promise.resolve({
      processed: 1,
      total: 1,
      uploaded: 1,
      deleted: 0,
      errors: 0,
    }),
  ),
}));

vi.mock("../lib/sync-helpers.js", () => ({
  createIndexingSpinner: vi.fn(() => ({
    spinner: {
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
      stop: vi.fn(),
      warn: vi.fn(),
    },
    onProgress: vi.fn(),
  })),
  formatDryRunSummary: vi.fn(() => "Dry run summary"),
}));

import * as context from "../lib/context.js";
// Import after mocks
import { search } from "./search.js";

describe("search command", () => {
  let mockStore: any;
  let mockFileSystem: any;
  let mockWebClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStore = {
      search: vi.fn(),
      ask: vi.fn(),
      retrieve: vi.fn(),
      create: vi.fn(),
      getInfo: vi.fn(() =>
        Promise.resolve({ counts: { pending: 0, in_progress: 0 } }),
      ),
    };

    mockFileSystem = {};

    mockWebClient = {
      search: vi.fn(),
    };

    vi.mocked(context.createStore).mockResolvedValue(mockStore);
    vi.mocked(context.createFileSystem).mockReturnValue(mockFileSystem);
    vi.mocked(context.createWebSearchClientFromConfig).mockReturnValue(
      mockWebClient,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("command structure", () => {
    it("should export search command", () => {
      expect(search).toBeDefined();
      expect(search.name()).toBe("search");
    });

    it("should have all required options", () => {
      const opts = search.opts();
      expect(opts).toHaveProperty("maxCount");
      expect(opts).toHaveProperty("content");
      expect(opts).toHaveProperty("answer");
      expect(opts).toHaveProperty("sync");
      expect(opts).toHaveProperty("dryRun");
      expect(opts).toHaveProperty("rerank");
      expect(opts).toHaveProperty("web");
    });

    it("should have correct description", () => {
      expect(search.description()).toContain("File pattern searcher");
    });
  });

  describe("search functionality", () => {
    it("should perform search without answer mode", async () => {
      const results = {
        data: [
          {
            type: "text" as const,
            text: "result",
            score: 0.9,
            metadata: { path: "/test.ts" },
            chunk_index: 0,
            generated_metadata: { start_line: 1, num_lines: 1 },
          },
        ],
      };

      mockStore.search.mockResolvedValue(results);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "--store", "test-store"]);

      expect(mockStore.search).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should perform ask with answer mode", async () => {
      const results = {
        answer: 'Answer <cite i="0" />',
        sources: [
          {
            type: "text" as const,
            text: "source",
            score: 0.9,
            metadata: { path: "/test.ts" },
            chunk_index: 0,
          },
        ],
      };

      mockStore.ask.mockResolvedValue(results);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-a", "--store", "test-store"]);

      expect(mockStore.ask).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle search errors", async () => {
      mockStore.search.mockRejectedValue(new Error("Search failed"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await search.parseAsync(["test", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to search: Search failed",
      );

      consoleSpy.mockRestore();
    });

    it("should apply path filter", async () => {
      mockStore.search.mockResolvedValue({ data: [] });

      await search.parseAsync(["test", "/src", "--store", "test-store"]);

      expect(mockStore.search).toHaveBeenCalledWith(
        ["test-store"],
        "test",
        10,
        { rerank: true },
        expect.objectContaining({
          all: expect.arrayContaining([
            expect.objectContaining({
              key: "path",
              operator: "starts_with",
              value: expect.stringContaining("/src"),
            }),
          ]),
        }),
      );
    });

    it("should respect max-count option", async () => {
      mockStore.search.mockResolvedValue({ data: [] });

      await search.parseAsync(["test", "-m", "5", "--store", "test-store"]);

      expect(mockStore.search).toHaveBeenCalledWith(
        ["test-store"],
        "test",
        5,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should respect rerank option", async () => {
      mockStore.search.mockResolvedValue({ data: [] });

      await search.parseAsync(["test", "--no-rerank", "--store", "test-store"]);

      expect(mockStore.search).toHaveBeenCalledWith(
        ["test-store"],
        "test",
        10,
        { rerank: false },
        expect.any(Object),
      );
    });

    it("should format text chunks correctly", async () => {
      const chunk = {
        type: "text" as const,
        text: "test content",
        score: 0.85,
        metadata: { path: "/test/file.ts" },
        generated_metadata: { start_line: 10, num_lines: 5 },
      };

      mockStore.search.mockResolvedValue({ data: [chunk] });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("85.00%");
      expect(output).toContain("file.ts");

      consoleSpy.mockRestore();
    });

    it("should format web results correctly", async () => {
      const chunk = {
        type: "text" as const,
        text: "web content",
        score: 0.92,
        filename: "https://example.com",
        metadata: { path: "https://example.com", hash: "", title: "Example" },
        chunk_index: 0,
        generated_metadata: { start_line: 0, num_lines: 1 },
      };

      mockStore.search.mockResolvedValue({ data: [chunk] });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("92.00%");
      expect(output).toContain("example.com");

      consoleSpy.mockRestore();
    });

    it("should show content when requested", async () => {
      const chunk = {
        type: "text" as const,
        text: "test content",
        score: 0.85,
        metadata: { path: "/test/file.ts" },
        generated_metadata: { start_line: 10, num_lines: 5 },
      };

      mockStore.search.mockResolvedValue({ data: [chunk] });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-c", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("test content");

      consoleSpy.mockRestore();
    });

    it("should extract single source from answer", async () => {
      const response = {
        answer: 'This is an answer <cite i="0" />',
        sources: [
          {
            text: "source 0",
            score: 0.9,
            type: "text" as const,
            metadata: {},
            chunk_index: 0,
          },
        ],
      };

      mockStore.ask.mockResolvedValue(response);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-a", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("This is an answer");
      expect(output).toContain("0:");

      consoleSpy.mockRestore();
    });

    it("should extract range of sources", async () => {
      const response = {
        answer: 'Answer with <cite i="1-3" />',
        sources: [
          {
            text: "source 0",
            score: 0.9,
            type: "text" as const,
            metadata: {},
            chunk_index: 0,
          },
          {
            text: "source 1",
            score: 0.8,
            type: "text" as const,
            metadata: {},
            chunk_index: 1,
          },
          {
            text: "source 2",
            score: 0.7,
            type: "text" as const,
            metadata: {},
            chunk_index: 2,
          },
          {
            text: "source 3",
            score: 0.6,
            type: "text" as const,
            metadata: {},
            chunk_index: 3,
          },
        ],
      };

      mockStore.ask.mockResolvedValue(response);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-a", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("1:");
      expect(output).toContain("2:");
      expect(output).toContain("3:");

      consoleSpy.mockRestore();
    });

    it("should handle multiple cite tags", async () => {
      const response = {
        answer: 'Answer <cite i="0" /> and <cite i="2" />',
        sources: [
          {
            text: "source 0",
            score: 0.9,
            type: "text" as const,
            metadata: {},
            chunk_index: 0,
          },
          {
            text: "source 1",
            score: 0.8,
            type: "text" as const,
            metadata: {},
            chunk_index: 1,
          },
          {
            text: "source 2",
            score: 0.7,
            type: "text" as const,
            metadata: {},
            chunk_index: 2,
          },
        ],
      };

      mockStore.ask.mockResolvedValue(response);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-a", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("0:");
      expect(output).toContain("2:");

      consoleSpy.mockRestore();
    });
  });

  describe("web search functionality", () => {
    it("should perform web search and format results", async () => {
      const webResponse = {
        results: [
          {
            url: "https://example.com",
            title: "Example Page",
            content: "Web search result content",
            score: 0.95,
          },
        ],
      };

      mockWebClient.search.mockResolvedValue(webResponse);
      mockStore.search.mockResolvedValue({ data: [] });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-w", "--store", "test-store"]);

      expect(mockWebClient.search).toHaveBeenCalledWith("test", {
        maxResults: 10,
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle web search errors gracefully", async () => {
      mockWebClient.search.mockRejectedValue(new Error("Web search failed"));
      mockStore.search.mockResolvedValue({ data: [] });

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-w", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Web search failed: Web search failed",
      );

      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should combine local and web results", async () => {
      const webResponse = {
        results: [
          {
            url: "https://example.com",
            title: "Example",
            content: "Web content",
            score: 0.95,
          },
        ],
      };

      const localResults = {
        data: [
          {
            type: "text" as const,
            text: "Local content",
            score: 0.85,
            metadata: { path: "/test/file.ts" },
            chunk_index: 0,
            generated_metadata: { start_line: 1, num_lines: 1 },
          },
        ],
      };

      mockWebClient.search.mockResolvedValue(webResponse);
      mockStore.search.mockResolvedValue(localResults);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-w", "--store", "test-store"]);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      // Both results should be present (sorted by score)
      expect(output).toContain("example.com");
      expect(output).toContain("file.ts");

      consoleSpy.mockRestore();
    });
  });

  describe("sync functionality", () => {
    it("should sync files before search when sync flag is set", async () => {
      mockStore.search.mockResolvedValue({ data: [] });

      await search.parseAsync(["test", "-s", "--store", "test-store"]);

      expect(mockStore.search).toHaveBeenCalled();
    });

    it("should handle dry-run mode", async () => {
      mockStore.search.mockResolvedValue({ data: [] });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await search.parseAsync(["test", "-s", "-d", "--store", "test-store"]);

      // The dry-run mode should print the summary
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
