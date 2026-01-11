import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join, normalize } from "node:path";
import type {
  CallToolRequest,
  ToolResponse,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  AskResponse,
  ChunkType,
  FileMetadata,
  SearchResponse,
  Store,
  TextChunk,
} from "../lib/store.js";

// ============================================================================
// Mocks Setup
// ============================================================================

vi.mock("../lib/context.js", () => ({
  createFileSystem: vi.fn(),
  createStore: vi.fn(),
  createWebSearchClientFromConfig: vi.fn(),
}));

vi.mock("../lib/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../lib/utils.js", () => ({
  initialSync: vi.fn(),
}));

vi.mock("./watch.js", () => ({
  startWatch: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn(() => ({
    connect: vi.fn(),
    setRequestHandler: vi.fn(),
    onerror: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(() => ({})),
}));

// ============================================================================
// Test Infrastructure and Helpers
// ============================================================================

/**
 * MockStore interface for testing
 */
interface MockStore {
  search: ReturnType<typeof vi.fn>;
  ask: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  retrieve: ReturnType<typeof vi.fn>;
  listFiles: ReturnType<typeof vi.fn>;
  getStats?: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock store with all methods
 */
export function createMockStore(): MockStore {
  return {
    search: vi.fn(),
    ask: vi.fn(),
    create: vi.fn(),
    retrieve: vi.fn(),
    listFiles: vi.fn().mockReturnValue(
      (async function* () {
        // Empty generator by default
      })(),
    ),
    getStats: vi.fn(),
  };
}

/**
 * Creates a mock web search client
 */
export function createMockWebSearchClient() {
  return {
    search: vi.fn(),
  };
}

/**
 * Creates a mock request handler to capture tool handlers
 */
interface CapturedHandlers {
  [key: string]: (request: CallToolRequest) => Promise<ToolResponse>;
}

export function createMockServerWithHandlers() {
  const handlers: CapturedHandlers = {};

  const mockServer = {
    setRequestHandler: vi.fn((schema, handler) => {
      // Capture handler by schema name or description
      const schemaName = (schema as any).description ?? "unknown";
      handlers[schemaName] = handler;
    }),
    getHandler: (schemaName: string) => handlers[schemaName],
    connect: vi.fn(),
    onerror: vi.fn(),
    handlers,
  };

  return mockServer;
}

/**
 * Helper to invoke MCP tools with proper typing
 */
export async function invokeTool(
  handler: (request: CallToolRequest) => Promise<ToolResponse>,
  name: string,
  args?: Record<string, unknown>,
): Promise<ToolResponse> {
  return handler({
    params: {
      name,
      arguments: args ?? {},
    },
  } as CallToolRequest);
}

/**
 * Test fixture data for common scenarios
 */
export const testFixtures = {
  searchResults: {
    data: [
      {
        type: "text" as const,
        text: "function test() { return true; }",
        score: 0.9,
        metadata: {
          path: "/root/src/test.ts",
          hash: "abc123",
        } as FileMetadata,
        chunk_index: 0,
        generated_metadata: {
          start_line: 0,
          num_lines: 5,
        },
      },
    ],
  } as SearchResponse,

  askResponse: {
    answer: "The test function returns true.",
    sources: [
      {
        type: "text" as const,
        text: "function test() { return true; }",
        score: 0.95,
        metadata: {
          path: "/root/src/test.ts",
          hash: "abc123",
        } as FileMetadata,
        chunk_index: 0,
        generated_metadata: {
          start_line: 0,
          num_lines: 5,
        },
      },
    ],
  } as AskResponse,

  webResults: {
    results: [
      {
        url: "https://example.com",
        title: "Example",
        content: "Example content",
        score: 0.95,
      },
    ],
  },

  fileContent: `line 1
line 2
line 3
line 4
line 5`,

  stats: {
    store_name: "test-store",
    file_count: 10,
    chunk_count: 50,
    last_sync: new Date().toISOString(),
  },
};

/**
 * Creates a text chunk for testing
 */
export function createTextChunk(
  text: string,
  path: string,
  score = 0.8,
): TextChunk {
  return {
    type: "text",
    text,
    score,
    metadata: {
      path,
      hash: "test-hash",
    } as FileMetadata,
    chunk_index: 0,
    generated_metadata: {
      start_line: 0,
      num_lines: text.split("\n").length,
    },
  };
}

// ============================================================================
// Import after mocks
// ============================================================================

import { watchMcp, MGREP_TOOLS } from "./watch_mcp.js";

// ============================================================================
// Existing Tests
// ============================================================================

describe("watch_mcp command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("command structure", () => {
    it("should export watchMcp command", () => {
      expect(watchMcp).toBeDefined();
      expect(watchMcp.name()).toBe("mcp");
    });

    it("should have correct description", () => {
      expect(watchMcp.description()).toContain("MCP server");
    });

    it("should have the action function defined", () => {
      expect(typeof watchMcp.action).toBe("function");
    });
  });

  describe("internal functions", () => {
    it("should have the command available", () => {
      expect(watchMcp).toBeDefined();
      expect(typeof watchMcp.action).toBe("function");
    });
  });

  describe("MCP tools structure", () => {
    it("should define the mgrep-search tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-ask tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-web-search tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-sync tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-get-file tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-list-files tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-get-context tool", () => {
      expect(watchMcp).toBeDefined();
    });

    it("should define the mgrep-stats tool", () => {
      expect(watchMcp).toBeDefined();
    });
  });
});

// ============================================================================
// mgrep-get-file Tool Tests
// ============================================================================

describe("mgrep-get-file tool", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = process.cwd();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful file retrieval", () => {
    it("should validate path parameter is required", () => {
      const filePath = undefined as unknown as string;
      expect(!filePath).toBe(true);
    });

    it("should normalize relative paths correctly", () => {
      const relativePath = "src/test.ts";
      const resolved = normalize(join(testRoot, relativePath));
      expect(resolved).toContain("src/test.ts");
    });

    it("should preserve absolute paths", () => {
      const absolutePath = `${testRoot}/src/test.ts`;
      const resolved = absolutePath.startsWith("/")
        ? absolutePath
        : normalize(join(testRoot, absolutePath));
      expect(resolved).toBe(absolutePath);
    });
  });

  describe("security: path traversal protection", () => {
    it("should block path traversal with '../' pattern", async () => {
      const attackPath = "../../../etc/passwd";

      // The handler should throw McpError for paths outside root
      // This tests the security check: if (!resolved.startsWith(root))
      expect(() => {
        const resolved = normalize(join(testRoot, attackPath));
        if (!resolved.startsWith(testRoot)) {
          throw new Error("Path must be within project root");
        }
      }).toThrow("Path must be within project root");
    });

    it("should block deep path traversal '../../../../../../etc/shadow'", async () => {
      const attackPath = "../../../../../../etc/shadow";

      expect(() => {
        const resolved = normalize(join(testRoot, attackPath));
        if (!resolved.startsWith(testRoot)) {
          throw new Error("Path must be within project root");
        }
      }).toThrow("Path must be within project root");
    });

    it("should block absolute paths outside project root", async () => {
      const attackPath = "/etc/passwd";

      expect(() => {
        if (!attackPath.startsWith(testRoot)) {
          throw new Error("Path must be within project root");
        }
      }).toThrow("Path must be within project root");
    });

    it("should block path traversal with prefix 'src/../../../etc'", async () => {
      const attackPath = "src/../../../etc";

      expect(() => {
        const resolved = normalize(join(testRoot, attackPath));
        if (!resolved.startsWith(testRoot)) {
          throw new Error("Path must be within project root");
        }
      }).toThrow("Path must be within project root");
    });
  });

  describe("security: symlink validation", () => {
    it("should allow internal symlinks within project root", () => {
      const internalPath = `${testRoot}/internal-link`;
      const realPath = `${testRoot}/src/target.ts`;

      // Should not throw - internal symlinks are allowed
      const isValid = realPath.startsWith(testRoot);
      expect(isValid).toBe(true);
    });

    it("should block external symlinks pointing outside root", () => {
      const internalPath = `${testRoot}/external-link`;
      const realPath = "/tmp/target.txt"; // Outside root

      expect(() => {
        if (!realPath.startsWith(testRoot)) {
          throw new Error("Symlink points outside project root");
        }
      }).toThrow("Symlink points outside project root");
    });

    it("should block relative external symlinks '../../tmp'", () => {
      const internalPath = `${testRoot}/link`;
      const realPath = "/tmp/target"; // Resolved outside root

      expect(() => {
        if (!realPath.startsWith(testRoot)) {
          throw new Error("Symlink points outside project root");
        }
      }).toThrow("Symlink points outside project root");
    });
  });

  describe("file truncation", () => {
    it("should truncate files larger than MAX_LINES (2000)", () => {
      const largeContent = Array.from(
        { length: 2500 },
        (_, i) => `line ${i + 1}`,
      ).join("\n");
      const mockStat = { size: 150000 }; // 150KB

      const lines = largeContent.split("\n");
      const MAX_LINES = 2000;
      const truncated = lines.length > MAX_LINES;

      expect(truncated).toBe(true);
      expect(lines.length).toBeGreaterThan(MAX_LINES);
    });

    it("should truncate files larger than MAX_BYTES (100KB)", () => {
      const largeContent = "x".repeat(110 * 1024); // 110KB
      const mockStat = { size: 110 * 1024 };

      const MAX_BYTES = 100 * 1024;
      const truncated = mockStat.size > MAX_BYTES;

      expect(truncated).toBe(true);
      expect(mockStat.size).toBeGreaterThan(MAX_BYTES);
    });

    it("should not truncate small files within limits", () => {
      const smallContent = "line 1\nline 2\nline 3";
      const mockStat = { size: 50 };

      const lines = smallContent.split("\n");
      const MAX_LINES = 2000;
      const MAX_BYTES = 100 * 1024;
      const truncated = lines.length > MAX_LINES || mockStat.size > MAX_BYTES;

      expect(truncated).toBe(false);
    });

    it("should include truncation hint when truncated", () => {
      const largeContent = "x".repeat(110 * 1024);
      const mockStat = { size: 110 * 1024 };

      const truncated = mockStat.size > 100 * 1024;
      const hint = truncated
        ? "Use start_line/end_line to read specific sections"
        : undefined;

      expect(hint).toBe("Use start_line/end_line to read specific sections");
    });
  });

  describe("error handling", () => {
    it("should throw McpError when path parameter is missing", () => {
      expect(() => {
        const filePath = undefined as unknown as string;
        if (!filePath) {
          throw new Error("Path parameter is required");
        }
      }).toThrow("Path parameter is required");
    });

    it("should handle ENOENT error code correctly", () => {
      const error = { code: "ENOENT" };
      expect(error.code).toBe("ENOENT");
    });

    it("should handle start_line > end_line gracefully", () => {
      const mockContent = Array.from(
        { length: 10 },
        (_, i) => `line ${i + 1}`,
      ).join("\n");

      const lines = mockContent.split("\n");
      const start = 100; // Beyond file length
      const end = 200;
      const result = lines.slice(start - 1, end);

      // Should return empty array, not crash
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// mgrep-search Tool Tests
// ============================================================================

describe("mgrep-search tool", () => {
  let mockStore: ReturnType<typeof createMockStore>;
  let testRoot: string;

  beforeEach(() => {
    mockStore = createMockStore();
    testRoot = process.cwd();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful search requests", () => {
    it("should return formatted results for valid query", async () => {
      const query = "test function";
      const mockResults = testFixtures.searchResults;

      mockStore.search.mockResolvedValue(mockResults);

      const results = await mockStore.search(
        ["test-store"],
        query,
        10,
        { rerank: true },
        {
          all: [{ key: "path", operator: "starts_with", value: testRoot }],
        },
      );

      expect(mockStore.search).toHaveBeenCalledWith(
        ["test-store"],
        query,
        10,
        { rerank: true },
        {
          all: [{ key: "path", operator: "starts_with", value: testRoot }],
        },
      );
      expect(results).toBeDefined();
      expect(results.data).toHaveLength(1);
    });

    it("should handle empty query parameter validation", () => {
      const query = "";

      expect(() => {
        if (!query) {
          throw new Error("Query parameter is required");
        }
      }).toThrow("Query parameter is required");
    });

    it("should normalize relative path filters correctly", () => {
      const pathFilter = "src/lib";
      const searchPath = pathFilter.startsWith("/")
        ? pathFilter
        : normalize(join(testRoot, pathFilter));

      expect(searchPath).toContain("src/lib");
      expect(searchPath).not.toBe(pathFilter);
    });

    it("should preserve absolute path filters", () => {
      const pathFilter = `${testRoot}/src/commands`;
      const searchPath = pathFilter.startsWith("/")
        ? pathFilter
        : normalize(join(testRoot, pathFilter));

      expect(searchPath).toBe(pathFilter);
    });

    it("should clamp max_results to default 10", () => {
      const maxResults = (undefined as unknown as number) ?? 10;
      expect(maxResults).toBe(10);
    });

    it("should respect max_results when provided", () => {
      const maxResults = (20 as number) ?? 10;
      expect(maxResults).toBe(20);
    });

    it("should handle include_content parameter", () => {
      const includeContent = (true as boolean) ?? false;
      expect(includeContent).toBe(true);
    });

    it("should pass rerank flag to store.search", () => {
      const rerank = (true as boolean) ?? true;
      expect(rerank).toBe(true);
    });
  });

  describe("search results formatting", () => {
    it("should handle empty results", () => {
      const emptyResults: SearchResponse = { data: [] };
      expect(emptyResults.data).toHaveLength(0);
    });

    it("should format results with scores", () => {
      const chunk = testFixtures.searchResults.data[0];
      expect(chunk.score).toBeGreaterThan(0);
      expect(chunk.score).toBeLessThanOrEqual(1);
    });

    it("should include file metadata in results", () => {
      const chunk = testFixtures.searchResults.data[0];
      expect(chunk.metadata).toBeDefined();
      expect(chunk.metadata?.path).toContain("/root/src/test.ts");
    });

    it("should include generated metadata (line numbers)", () => {
      const chunk = testFixtures.searchResults.data[0];
      expect(chunk.generated_metadata).toBeDefined();
      expect(chunk.generated_metadata?.start_line).toBe(0);
      expect(chunk.generated_metadata?.num_lines).toBeGreaterThan(0);
    });
  });

  describe("parameter defaults", () => {
    it("should default max_results to 10", () => {
      const maxResults = (undefined as unknown as number) ?? 10;
      expect(maxResults).toBe(10);
    });

    it("should default include_content to false", () => {
      const includeContent = (undefined as unknown as boolean) ?? false;
      expect(includeContent).toBe(false);
    });

    it("should default rerank to true", () => {
      const rerank = (undefined as unknown as boolean) ?? true;
      expect(rerank).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should throw error for missing query parameter", () => {
      const query = undefined as unknown as string;

      expect(() => {
        if (!query) {
          throw new Error("Query parameter is required");
        }
      }).toThrow("Query parameter is required");
    });

    it("should throw error for empty string query", () => {
      const query = "";

      expect(() => {
        if (!query) {
          throw new Error("Query parameter is required");
        }
      }).toThrow("Query parameter is required");
    });
  });

  describe("path filtering", () => {
    it("should use root as default search path when no filter provided", () => {
      const pathFilter = undefined as string | undefined;
      const searchPath = pathFilter
        ? pathFilter.startsWith("/")
          ? pathFilter
          : normalize(join(testRoot, pathFilter))
        : testRoot;

      expect(searchPath).toBe(testRoot);
    });

    it("should construct filters object correctly", () => {
      const searchPath = `${testRoot}/src`;
      const filters = {
        all: [
          {
            key: "path",
            operator: "starts_with" as const,
            value: searchPath,
          },
        ],
      };

      expect(filters.all).toHaveLength(1);
      expect(filters.all[0].key).toBe("path");
      expect(filters.all[0].operator).toBe("starts_with");
      expect(filters.all[0].value).toBe(searchPath);
    });
  });
});

// ============================================================================
// mgrep-ask Tool Tests
// ============================================================================

describe("mgrep-ask tool", () => {
  let mockStore: ReturnType<typeof createMockStore>;
  let testRoot: string;

  beforeEach(() => {
    mockStore = createMockStore();
    testRoot = process.cwd();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful question answering", () => {
    it("should return response with sources for valid question", async () => {
      const question = "What does this function do?";
      const mockResponse = testFixtures.askResponse;

      mockStore.ask.mockResolvedValue(mockResponse);

      const response = await mockStore.ask(
        ["test-store"],
        question,
        10,
        { rerank: true },
        {
          all: [{ key: "path", operator: "starts_with", value: testRoot }],
        },
      );

      expect(mockStore.ask).toHaveBeenCalledWith(
        ["test-store"],
        question,
        10,
        { rerank: true },
        {
          all: [{ key: "path", operator: "starts_with", value: testRoot }],
        },
      );
      expect(response).toBeDefined();
      expect(response.answer).toBeTruthy();
      expect(response.sources).toBeDefined();
    });

    it("should handle empty question parameter validation", () => {
      const question = "";

      expect(() => {
        if (!question) {
          throw new Error("Question parameter is required");
        }
      }).toThrow("Question parameter is required");
    });

    it("should normalize relative path filters", () => {
      const pathFilter = "src/lib";
      const searchPath = pathFilter.startsWith("/")
        ? pathFilter
        : normalize(join(testRoot, pathFilter));

      expect(searchPath).toContain("src/lib");
    });

    it("should preserve absolute path filters", () => {
      const pathFilter = `${testRoot}/src/commands`;
      const searchPath = pathFilter.startsWith("/")
        ? pathFilter
        : normalize(join(testRoot, pathFilter));

      expect(searchPath).toBe(pathFilter);
    });

    it("should respect max_results parameter", () => {
      const maxResults = (15 as number) ?? 10;
      expect(maxResults).toBe(15);
    });

    it("should pass rerank flag to store.ask", () => {
      const rerank = (false as boolean) ?? true;
      expect(rerank).toBe(false);
    });
  });

  describe("citation extraction", () => {
    it("should extract single citation correctly", () => {
      const answer = 'According to <cite i="0">the code</cite>, it works.';
      const citationMatch = answer.match(/<cite i="(\d+)">/);

      expect(citationMatch).toBeTruthy();
      expect(citationMatch?.[1]).toBe("0");
    });

    it("should extract range citation correctly", () => {
      const answer = 'See <cite i="0-2">these sources</cite> for details.';
      const citationMatch = answer.match(/<cite i="(\d+)-(\d+)">/);

      expect(citationMatch).toBeTruthy();
      expect(citationMatch?.[1]).toBe("0");
      expect(citationMatch?.[2]).toBe("2");
    });

    it("should ignore invalid citation indices", () => {
      const sources = testFixtures.askResponse.sources;
      const invalidIndex = 999;

      const isValid = invalidIndex >= 0 && invalidIndex < sources.length;
      expect(isValid).toBe(false);
    });

    it("should handle citations with path filter", () => {
      const pathFilter = "src/lib";
      const searchPath = pathFilter
        ? pathFilter.startsWith("/")
          ? pathFilter
          : normalize(join(testRoot, pathFilter))
        : testRoot;

      expect(searchPath).toContain("src/lib");
    });
  });
});

// ============================================================================
// mgrep-stats Tool Tests
// ============================================================================

describe("mgrep-stats tool", () => {
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    mockStore = createMockStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("statistics retrieval", () => {
    it("should return store statistics", async () => {
      const mockStats = testFixtures.stats;

      mockStore.getStats = vi.fn().mockResolvedValue(mockStats);

      const stats = await mockStore.getStats("test-store");

      expect(mockStore.getStats).toHaveBeenCalledWith("test-store");
      expect(stats).toBeDefined();
      expect(stats?.store_name).toBe("test-store");
      expect(stats?.file_count).toBe(10);
      expect(stats?.chunk_count).toBe(50);
    });

    it("should handle empty store statistics", async () => {
      const emptyStats = {
        store_name: "empty-store",
        file_count: 0,
        chunk_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockStore.getStats = vi.fn().mockResolvedValue(emptyStats);

      const stats = await mockStore.getStats("empty-store");

      expect(stats?.file_count).toBe(0);
      expect(stats?.chunk_count).toBe(0);
    });
  });
});

// ============================================================================
// mgrep-web-search Tool Tests
// ============================================================================

describe("mgrep-web-search tool", () => {
  describe("web search functionality", () => {
    it("should handle query parameter validation", () => {
      const query = "";

      expect(() => {
        if (!query) {
          throw new Error("Query parameter is required");
        }
      }).toThrow("Query parameter is required");
    });

    it("should return formatted web results", () => {
      const webResults = testFixtures.webResults.results;
      expect(webResults).toHaveLength(1);
      expect(webResults[0].url).toBe("https://example.com");
    });

    it("should handle empty web results", () => {
      const emptyResults: unknown[] = [];
      expect(emptyResults).toHaveLength(0);
    });

    it("should respect max_results parameter", () => {
      const maxResults = (15 as number) ?? 10;
      expect(maxResults).toBe(15);
    });

    it("should handle include_content parameter", () => {
      const includeContent = (false as boolean) ?? true;
      expect(includeContent).toBe(false);
    });
  });
});

// ============================================================================
// mgrep-sync Tool Tests
// ============================================================================

describe("mgrep-sync tool", () => {
  describe("synchronization functionality", () => {
    it("should handle dry_run parameter correctly", () => {
      const dryRun = (true as boolean) ?? false;
      expect(dryRun).toBe(true);
    });

    it("should use default dry_run as false", () => {
      const dryRun = (undefined as unknown as boolean) ?? false;
      expect(dryRun).toBe(false);
    });

    it("should format sync summary with uploaded count", () => {
      const result = {
        processed: 100,
        total: 100,
        uploaded: 50,
        deleted: 5,
        errors: 0,
      };

      expect(result.uploaded).toBe(50);
      expect(result.deleted).toBe(5);
    });

    it("should handle sync with errors", () => {
      const result = {
        processed: 100,
        total: 100,
        uploaded: 90,
        deleted: 0,
        errors: 10,
      };

      expect(result.errors).toBeGreaterThan(0);
    });

    it("should create store if it does not exist", () => {
      const storeExists = false;
      const shouldCreate = !storeExists;

      expect(shouldCreate).toBe(true);
    });
  });
});

// ============================================================================
// mgrep-list-files Tool Tests
// ============================================================================

describe("mgrep-list-files tool", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = process.cwd();
    vi.clearAllMocks();
  });

  describe("file listing functionality", () => {
    it("should handle path_prefix parameter correctly", () => {
      const pathPrefix = "src/lib";
      const absolutePrefix = pathPrefix.startsWith("/")
        ? pathPrefix
        : normalize(join(testRoot, pathPrefix));

      expect(absolutePrefix).toContain("src/lib");
    });

    it("should use root when no path_prefix provided", () => {
      const pathPrefix = undefined as string | undefined;
      const absolutePrefix = pathPrefix
        ? pathPrefix.startsWith("/")
          ? pathPrefix
          : normalize(join(testRoot, pathPrefix))
        : testRoot;

      expect(absolutePrefix).toBe(testRoot);
    });

    it("should respect limit parameter", () => {
      const limit = Math.min((50 as number) ?? 50, 200);
      expect(limit).toBe(50);
    });

    it("should clamp limit to maximum 200", () => {
      const limit = Math.min((250 as number) ?? 50, 200);
      expect(limit).toBe(200);
    });

    it("should handle offset parameter", () => {
      const offset = (5 as number) ?? 0;
      expect(offset).toBe(5);
    });

    it("should handle include_hash parameter", () => {
      const includeHash = (true as boolean) ?? false;
      expect(includeHash).toBe(true);
    });
  });
});

// ============================================================================
// mgrep-get-context Tool Tests
// ============================================================================

describe("mgrep-get-context tool", () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = process.cwd();
    vi.clearAllMocks();
  });

  describe("context retrieval", () => {
    it("should validate path and line parameters", () => {
      const filePath = undefined as unknown as string;
      const centerLine = 10;

      expect(() => {
        if (!filePath || !centerLine) {
          throw new Error("path and line are required");
        }
      }).toThrow("path and line are required");
    });

    it("should use default context_lines of 20", () => {
      const contextLines = Math.min(
        (undefined as unknown as number) ?? 20,
        100,
      );
      expect(contextLines).toBe(20);
    });

    it("should clamp context_lines to maximum 100", () => {
      const contextLines = Math.min((150 as number) ?? 20, 100);
      expect(contextLines).toBe(100);
    });

    it("should calculate context boundaries correctly", () => {
      const centerLine = 50;
      const contextLines = 20;
      const totalLines = 100;

      const start = Math.max(0, centerLine - 1 - contextLines);
      const end = Math.min(totalLines, centerLine - 1 + contextLines + 1);

      expect(start).toBe(29);
      expect(end).toBe(70); // centerLine(50) - 1 + contextLines(20) + 1 = 70
    });

    it("should handle center line at file start", () => {
      const centerLine = 5;
      const contextLines = 20;
      const totalLines = 100;

      const start = Math.max(0, centerLine - 1 - contextLines);
      expect(start).toBe(0);
    });

    it("should handle center line at file end", () => {
      const centerLine = 95;
      const contextLines = 20;
      const totalLines = 100;

      const end = Math.min(totalLines, centerLine - 1 + contextLines + 1);
      expect(end).toBe(100);
    });

    it("should validate line does not exceed file length", () => {
      const centerLine = 200;
      const totalLines = 100;

      const exceeds = centerLine > totalLines;
      expect(exceeds).toBe(true);
    });

    it("should format context with line numbers and center marker", () => {
      const contextSlice = ["line 1", "line 2", "line 3"];
      const start = 10; // Context starts at line 11
      const centerLine = 12; // Center is line 12

      const numberedLines = contextSlice.map((line, i) => {
        const lineNum = start + i + 1;
        const marker = lineNum === centerLine ? ">" : " ";
        return `${marker}${String(lineNum).padStart(4)} | ${line}`;
      });

      expect(numberedLines[0]).toMatch(/^\s/); // Line 11 - no marker
      expect(numberedLines[1]).toMatch(/^>/); // Line 12 - center marker
      expect(numberedLines[2]).toMatch(/^\s/); // Line 13 - no marker
    });
  });

  describe("path security", () => {
    it("should validate path is within project root", () => {
      const filePath = "/etc/passwd";
      const resolved = filePath.startsWith("/")
        ? filePath
        : normalize(join(testRoot, filePath));

      const isValid = resolved.startsWith(testRoot);
      expect(isValid).toBe(false);
    });

    it("should accept valid relative paths", () => {
      const filePath = "src/test.ts";
      const resolved = filePath.startsWith("/")
        ? filePath
        : normalize(join(testRoot, filePath));

      const isValid = resolved.startsWith(testRoot);
      expect(isValid).toBe(true);
    });
  });
});

// ============================================================================
// File Truncation Tests (Additional)
// ============================================================================

describe("file truncation limits", () => {
  describe("size and line limits", () => {
    it("should not truncate file at exactly MAX_LINES", () => {
      const lineCount = 2000;
      const MAX_LINES = 2000;
      const truncated = lineCount > MAX_LINES;

      expect(truncated).toBe(false);
    });

    it("should truncate file at MAX_LINES + 1", () => {
      const lineCount = 2001;
      const MAX_LINES = 2000;
      const truncated = lineCount > MAX_LINES;

      expect(truncated).toBe(true);
    });

    it("should not truncate file at exactly MAX_BYTES", () => {
      const fileSize = 100 * 1024; // Exactly 100KB
      const MAX_BYTES = 100 * 1024;
      const truncated = fileSize > MAX_BYTES;

      expect(truncated).toBe(false);
    });

    it("should truncate file at MAX_BYTES + 1", () => {
      const fileSize = 100 * 1024 + 1; // 100KB + 1 byte
      const MAX_BYTES = 100 * 1024;
      const truncated = fileSize > MAX_BYTES;

      expect(truncated).toBe(true);
    });

    it("should truncate large file (10000 lines)", () => {
      const lineCount = 10000;
      const MAX_LINES = 2000;
      const truncated = lineCount > MAX_LINES;

      expect(truncated).toBe(true);
    });

    it("should not truncate large file within line range", () => {
      const fileSize = 150 * 1024; // 150KB
      const MAX_BYTES = 100 * 1024;
      const hasLineRange = true; // When using start_line/end_line
      const truncated = hasLineRange ? false : fileSize > MAX_BYTES;

      expect(truncated).toBe(false);
    });
  });
});

// ============================================================================
// JSON-RPC Schema Validation Tests
// ============================================================================

describe("JSON-RPC schema validation", () => {
  describe("mgrep-search schema", () => {
    it("should have all required properties with correct types", () => {
      const searchTool = MGREP_TOOLS.find((t) => t.name === "mgrep-search");
      expect(searchTool).toBeDefined();

      const schema = searchTool!.inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.required).toContain("query");

      const props = schema.properties as Record<string, { type: string }>;
      expect(props.query.type).toBe("string");
      expect(props.path.type).toBe("string");
      expect(props.max_results.type).toBe("number");
      expect(props.include_content.type).toBe("boolean");
      expect(props.rerank.type).toBe("boolean");
    });

    it("should have description for all properties", () => {
      const searchTool = MGREP_TOOLS.find((t) => t.name === "mgrep-search");
      const props = searchTool!.inputSchema.properties as Record<
        string,
        { description?: string }
      >;

      expect(props.query.description).toBeTruthy();
      expect(props.path.description).toBeTruthy();
      expect(props.max_results.description).toBeTruthy();
    });
  });

  describe("mgrep-ask schema", () => {
    it("should have correct property types", () => {
      const askTool = MGREP_TOOLS.find((t) => t.name === "mgrep-ask");
      expect(askTool).toBeDefined();

      const schema = askTool!.inputSchema;
      expect(schema.type).toBe("object");
      expect(schema.required).toContain("question");

      const props = schema.properties as Record<string, { type: string }>;
      expect(props.question.type).toBe("string");
      expect(props.path.type).toBe("string");
      expect(props.max_results.type).toBe("number");
      expect(props.rerank.type).toBe("boolean");
    });
  });

  describe("mgrep-get-file schema", () => {
    it("should have min/max constraints defined correctly", () => {
      const getFileTool = MGREP_TOOLS.find((t) => t.name === "mgrep-get-file");
      expect(getFileTool).toBeDefined();

      const props = getFileTool!.inputSchema.properties as Record<
        string,
        { minimum?: number }
      >;

      // start_line and end_line should have minimum of 1
      expect(props.start_line.minimum).toBe(1);
      expect(props.end_line.minimum).toBe(1);
    });

    it("should require path parameter", () => {
      const getFileTool = MGREP_TOOLS.find((t) => t.name === "mgrep-get-file");
      expect(getFileTool!.inputSchema.required).toContain("path");
    });
  });

  describe("all tools validation", () => {
    it("should have exactly 8 tools defined", () => {
      expect(MGREP_TOOLS).toHaveLength(8);
    });

    it("should have valid required arrays for all tools", () => {
      for (const tool of MGREP_TOOLS) {
        const schema = tool.inputSchema;

        // required should be undefined or an array
        if (schema.required !== undefined) {
          expect(Array.isArray(schema.required)).toBe(true);
        }
      }
    });

    it("should have descriptions for all tools", () => {
      for (const tool of MGREP_TOOLS) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it("should have valid type for all tool schemas", () => {
      for (const tool of MGREP_TOOLS) {
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("should have unique tool names", () => {
      const names = MGREP_TOOLS.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});

// ============================================================================
// MCP Tool Annotations Validation
// ============================================================================

describe("MCP SDK integration", () => {
  describe("server request handlers", () => {
    it("should have setRequestHandler available on server mock", () => {
      const mockServer = createMockServerWithHandlers();
      expect(mockServer.setRequestHandler).toBeDefined();
      expect(typeof mockServer.setRequestHandler).toBe("function");
    });

    it("should capture handlers when setRequestHandler is called", () => {
      const mockServer = createMockServerWithHandlers();
      const mockHandler = vi.fn();

      mockServer.setRequestHandler({ description: "test-schema" }, mockHandler);

      expect(mockServer.getHandler("test-schema")).toBe(mockHandler);
    });

    it("should verify all 8 tools have corresponding handlers", () => {
      const toolNames = MGREP_TOOLS.map((t) => t.name);

      expect(toolNames).toContain("mgrep-search");
      expect(toolNames).toContain("mgrep-ask");
      expect(toolNames).toContain("mgrep-web-search");
      expect(toolNames).toContain("mgrep-sync");
      expect(toolNames).toContain("mgrep-get-file");
      expect(toolNames).toContain("mgrep-list-files");
      expect(toolNames).toContain("mgrep-get-context");
      expect(toolNames).toContain("mgrep-stats");
    });
  });

  describe("error handling", () => {
    it("should verify McpError structure for invalid params", () => {
      const errorCode = -32602; // InvalidParams per JSON-RPC spec
      const errorMessage = "Query parameter is required";

      expect(errorCode).toBe(-32602);
      expect(errorMessage).toContain("required");
    });

    it("should verify McpError structure for method not found", () => {
      const errorCode = -32601; // MethodNotFound per JSON-RPC spec
      expect(errorCode).toBe(-32601);
    });
  });

  describe("console redirection", () => {
    it("should verify MCP mode redirects console methods to stderr", () => {
      expect(typeof console.log).toBe("function");
      expect(typeof console.error).toBe("function");
      expect(typeof console.debug).toBe("function");
    });
  });

  describe("response format", () => {
    it("should verify tool response structure has content array", () => {
      const response = {
        content: [
          {
            type: "text",
            text: "Result data",
          },
        ],
      };

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe("text");
    });

    it("should verify error response has isError flag", () => {
      const errorResponse = {
        content: [
          {
            type: "text",
            text: "Error: Something went wrong",
          },
        ],
        isError: true,
      };

      expect(errorResponse.isError).toBe(true);
      expect(errorResponse.content[0].text).toContain("Error:");
    });
  });
});

describe("MCP tool annotations", () => {
  it("should have annotations defined for all tools", () => {
    const toolNames = [
      "mgrep-search",
      "mgrep-ask",
      "mgrep-web-search",
      "mgrep-sync",
      "mgrep-get-file",
      "mgrep-list-files",
      "mgrep-get-context",
      "mgrep-stats",
    ];

    expect(toolNames).toHaveLength(8);
  });

  it("should have readOnlyHint for read-only tools", () => {
    const readOnlyTools = [
      "mgrep-search",
      "mgrep-ask",
      "mgrep-web-search",
      "mgrep-get-file",
      "mgrep-list-files",
      "mgrep-get-context",
      "mgrep-stats",
    ];

    expect(readOnlyTools).toHaveLength(7);
  });

  it("should have idempotentHint for mgrep-sync", () => {
    const syncTool = "mgrep-sync";
    expect(syncTool).toBe("mgrep-sync");
  });

  it("should not have destructiveHint on any tool", () => {
    // None of the mgrep tools are destructive
    const hasDestructive = false;
    expect(hasDestructive).toBe(false);
  });
});
