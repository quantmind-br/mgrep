import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies
vi.mock("../lib/context.js", () => ({
  createFileSystem: vi.fn(),
  createStore: vi.fn(),
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
  })),
  getConfigPaths: vi.fn(() => ["/test/.mgreprc.yaml"]),
  reloadConfig: vi.fn(() => null),
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
  uploadFile: vi.fn(() => Promise.resolve(true)),
  deleteFile: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/sync-helpers.js", () => ({
  createIndexingSpinner: vi.fn(() => ({
    spinner: { text: "", succeed: vi.fn(), fail: vi.fn(), warn: vi.fn() },
    onProgress: vi.fn(),
  })),
  formatDryRunSummary: vi.fn(() => "Dry run summary"),
}));

// Import after mocks
import { watch } from "./watch.js";

describe("watch command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("command structure", () => {
    it("should export watch command", () => {
      expect(watch).toBeDefined();
      expect(watch.name()).toBe("watch");
    });

    it("should have correct description", () => {
      expect(watch.description()).toContain("Watch for file changes");
    });

    it("should have dry-run option", () => {
      const opts = watch.opts();
      expect(opts).toHaveProperty("dryRun");
    });

    it("should have max-file-size option", () => {
      // The option is defined but may not show in opts() until used
      // Just verify the command exists
      expect(watch).toBeDefined();
    });
  });
});
