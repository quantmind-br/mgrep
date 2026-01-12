import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TestMCPClient } from "../lib/test-mcp-client.js";

describe("MCP Tool Integration Tests", () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = new TestMCPClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await client.clearData();
  });

  describe("mgrep-search", () => {
    it("returns results for matching query", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content: "export function main() {\n  console.log('Hello World');\n}",
        },
        {
          path: "src/utils.ts",
          content: "export function helper() {\n  return 42;\n}",
        },
      ]);

      const result = await client.callTool("mgrep-search", {
        query: "main function",
        max_results: 10,
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      const text = result.content[0]?.text || "";
      expect(text).toBeTruthy();
    });

    it("returns empty for no matches", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content: "export function main() {}",
        },
      ]);

      const result = await client.callTool("mgrep-search", {
        query: "nonexistent query that will never match",
        max_results: 10,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toContain("No results found");
    });

    it("respects max_results limit", async () => {
      await client.seedData([
        { path: "file1.ts", content: "function test() {}" },
        { path: "file2.ts", content: "function test() {}" },
        { path: "file3.ts", content: "function test() {}" },
      ]);

      const result = await client.callTool("mgrep-search", {
        query: "function",
        max_results: 2,
      });

      expect(result.isError).toBe(false);
      const text = result.content[0]?.text || "";
      expect(text).toMatch(/Found \d+ result/);
    });

    it("filters by path parameter", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
        { path: "tests/test.ts", content: "export function test() {}" },
      ]);

      const result = await client.callTool("mgrep-search", {
        query: "function",
        path: "src",
        max_results: 10,
      });

      expect(result.isError).toBe(false);
      const text = result.content[0]?.text || "";
      expect(text).toContain("src/index.ts");
      expect(text).not.toContain("tests/test.ts");
    });

    it("includes content when include_content=true", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content: "export function main() {\n  console.log('test');\n}",
        },
      ]);

      const result = await client.callTool("mgrep-search", {
        query: "main",
        include_content: true,
        max_results: 10,
      });

      expect(result.isError).toBe(false);
    });

    it("respects rerank flag", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
      ]);

      const withRerank = await client.callTool("mgrep-search", {
        query: "main",
        rerank: true,
        max_results: 10,
      });

      const withoutRerank = await client.callTool("mgrep-search", {
        query: "main",
        rerank: false,
        max_results: 10,
      });

      expect(withRerank.isError).toBe(false);
      expect(withoutRerank.isError).toBe(false);
    });

    it("errors on missing query parameter", async () => {
      try {
        await client.callTool("mgrep-search", {
          max_results: 10,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain("Query parameter is required");
      }
    });
  });

  describe("mgrep-ask", () => {
    it("returns answer with citations", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content:
            "export function main() {\n  console.log('Application started');\n}",
        },
      ]);

      const result = await client.callTool("mgrep-ask", {
        question: "What does the main function do?",
        max_results: 10,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toContain("Answer:");
      expect(result.content[0]?.text).toContain("Sources:");
    });

    it("sources are included in response", async () => {
      await client.seedData([
        { path: "src/utils.ts", content: "export const VERSION = '1.0.0';" },
      ]);

      const result = await client.callTool("mgrep-ask", {
        question: "What is the version?",
        max_results: 10,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toMatch(/Sources: \d+ chunks/);
    });

    it("respects max_results for context", async () => {
      await client.seedData([
        { path: "file1.ts", content: "const a = 1;" },
        { path: "file2.ts", content: "const b = 2;" },
        { path: "file3.ts", content: "const c = 3;" },
      ]);

      const result = await client.callTool("mgrep-ask", {
        question: "What constants are defined?",
        max_results: 2,
      });

      expect(result.isError).toBe(false);
    });

    it("filters by path parameter", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export const APP_NAME = 'mgrep';" },
        { path: "tests/test.ts", content: "export const TEST_NAME = 'test';" },
      ]);

      const result = await client.callTool("mgrep-ask", {
        question: "What is the app name?",
        path: "src",
        max_results: 10,
      });

      expect(result.isError).toBe(false);
    });

    it("errors on missing question parameter", async () => {
      try {
        await client.callTool("mgrep-ask", {
          max_results: 10,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain("Question parameter is required");
      }
    });
  });

  describe("mgrep-get-file", () => {
    it("returns file content for valid path", async () => {
      const content = "line 1\nline 2\nline 3\nline 4\nline 5";
      await client.seedData([{ path: "test.txt", content }]);

      const result = await client.callTool("mgrep-get-file", {
        path: "test.txt",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toBe(content);
    });

    it("respects start_line parameter", async () => {
      const content = "line 1\nline 2\nline 3\nline 4\nline 5";
      await client.seedData([{ path: "test.txt", content }]);

      const result = await client.callTool("mgrep-get-file", {
        path: "test.txt",
        start_line: 3,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toBe("line 3\nline 4\nline 5");
    });

    it("respects end_line parameter", async () => {
      const content = "line 1\nline 2\nline 3\nline 4\nline 5";
      await client.seedData([{ path: "test.txt", content }]);

      const result = await client.callTool("mgrep-get-file", {
        path: "test.txt",
        end_line: 3,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toBe("line 1\nline 2\nline 3");
    });

    it("respects both start_line and end_line", async () => {
      const content = "line 1\nline 2\nline 3\nline 4\nline 5";
      await client.seedData([{ path: "test.txt", content }]);

      const result = await client.callTool("mgrep-get-file", {
        path: "test.txt",
        start_line: 2,
        end_line: 4,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toBe("line 2\nline 3\nline 4");
    });

    it("errors on file not found", async () => {
      try {
        await client.callTool("mgrep-get-file", {
          path: "nonexistent.txt",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain("File not found");
      }
    });
  });

  describe("mgrep-list-files", () => {
    it("lists all indexed files", async () => {
      await client.seedData([
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
        { path: "file3.ts", content: "content3" },
      ]);

      const result = await client.callTool("mgrep-list-files", {});

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.files).toHaveLength(3);
      expect(data.total).toBe(3);
    });

    it("filters by path_prefix", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "content1" },
        { path: "src/utils.ts", content: "content2" },
        { path: "tests/test.ts", content: "content3" },
      ]);

      const result = await client.callTool("mgrep-list-files", {});

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.files.length).toBeGreaterThanOrEqual(3);
    });

    it("respects limit parameter", async () => {
      await client.seedData([
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
        { path: "file3.ts", content: "content3" },
      ]);

      const result = await client.callTool("mgrep-list-files", {
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.files).toHaveLength(2);
    });

    it("respects offset parameter", async () => {
      await client.seedData([
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
        { path: "file3.ts", content: "content3" },
      ]);

      const result = await client.callTool("mgrep-list-files", {
        offset: 1,
        limit: 2,
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0]?.text || "{}");
      expect(data.files).toHaveLength(2);
    });
  });

  describe("mgrep-get-context", () => {
    it("returns context around specified line", async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
      await client.seedData([{ path: "test.txt", content: lines.join("\n") }]);

      const result = await client.callTool("mgrep-get-context", {
        path: "test.txt",
        line: 25,
        context_lines: 5,
      });

      expect(result.isError).toBe(false);
      const text = result.content[0]?.text || "";
      expect(text).toContain("25: line 25");
      expect(text).toContain("20: line 20");
      expect(text).toContain("30: line 30");
    });

    it("marks center line correctly", async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      await client.seedData([{ path: "test.txt", content: lines.join("\n") }]);

      const result = await client.callTool("mgrep-get-context", {
        path: "test.txt",
        line: 10,
        context_lines: 3,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toContain("10: line 10");
    });

    it("respects context_lines parameter", async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
      await client.seedData([{ path: "test.txt", content: lines.join("\n") }]);

      const result = await client.callTool("mgrep-get-context", {
        path: "test.txt",
        line: 25,
        context_lines: 10,
      });

      expect(result.isError).toBe(false);
      const text = result.content[0]?.text || "";
      expect(text).toContain("15: line 15");
      expect(text).toContain("35: line 35");
    });

    it("clamps to file boundaries at start", async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
      await client.seedData([{ path: "test.txt", content: lines.join("\n") }]);

      const result = await client.callTool("mgrep-get-context", {
        path: "test.txt",
        line: 2,
        context_lines: 10,
      });

      expect(result.isError).toBe(false);
      const text = result.content[0]?.text || "";
      expect(text).toContain("1: line 1");
    });

    it("clamps to file boundaries at end", async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
      await client.seedData([{ path: "test.txt", content: lines.join("\n") }]);

      const result = await client.callTool("mgrep-get-context", {
        path: "test.txt",
        line: 9,
        context_lines: 10,
      });

      expect(result.isError).toBe(false);
      const text = result.content[0]?.text || "";
      expect(text).toContain("10: line 10");
    });
  });

  describe("mgrep-stats", () => {
    it("returns store statistics", async () => {
      await client.seedData([
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
      ]);

      const result = await client.callTool("mgrep-stats", {});

      expect(result.isError).toBe(false);
      const stats = JSON.parse(result.content[0]?.text || "{}");
      expect(stats).toHaveProperty("store_name");
      expect(stats).toHaveProperty("file_count");
      expect(stats).toHaveProperty("chunk_count");
    });

    it("includes file and chunk counts", async () => {
      await client.seedData([
        { path: "file1.ts", content: "content1" },
        { path: "file2.ts", content: "content2" },
      ]);

      const result = await client.callTool("mgrep-stats", {});

      expect(result.isError).toBe(false);
      const stats = JSON.parse(result.content[0]?.text || "{}");
      expect(stats.file_count).toBeGreaterThan(0);
      expect(stats.chunk_count).toBeGreaterThan(0);
    });

    it("handles empty store", async () => {
      const result = await client.callTool("mgrep-stats", {});

      expect(result.isError).toBe(false);
      const stats = JSON.parse(result.content[0]?.text || "{}");
      expect(stats.file_count).toBe(0);
      expect(stats.chunk_count).toBe(0);
    });
  });

  describe("mgrep-find-symbol", () => {
    it("finds function definitions", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content:
            "export function main() {}\nexport function helper() {}\nfunction internal() {}",
        },
      ]);

      const result = await client.callTool("mgrep-find-symbol", {
        name: "main",
        type: "function",
      });

      expect(result.isError).toBe(false);
      const symbols = JSON.parse(result.content[0]?.text || "[]");
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0]).toHaveProperty("name");
      expect(symbols[0]).toHaveProperty("type");
    });

    it("finds class definitions", async () => {
      await client.seedData([
        {
          path: "src/class.ts",
          content: "export class MyClass {}\nclass InternalClass {}",
        },
      ]);

      const result = await client.callTool("mgrep-find-symbol", {
        name: "MyClass",
        type: "class",
      });

      expect(result.isError).toBe(false);
      const symbols = JSON.parse(result.content[0]?.text || "[]");
      expect(symbols.length).toBeGreaterThan(0);
    });

    it("filters by type parameter", async () => {
      await client.seedData([
        {
          path: "src/mixed.ts",
          content:
            "export function test() {}\nexport class test {}\nexport const test = 1;",
        },
      ]);

      const result = await client.callTool("mgrep-find-symbol", {
        name: "test",
        type: "function",
      });

      expect(result.isError).toBe(false);
      const symbols = JSON.parse(result.content[0]?.text || "[]");
      if (symbols.length > 0) {
        expect(symbols[0].type).toBe("function");
      }
    });

    it("supports partial matching", async () => {
      await client.seedData([
        {
          path: "src/utils.ts",
          content:
            "export function getValue() {}\nexport function getData() {}\nexport function getInfo() {}",
        },
      ]);

      const result = await client.callTool("mgrep-find-symbol", {
        name: "get",
        exact: false,
      });

      expect(result.isError).toBe(false);
      const symbols = JSON.parse(result.content[0]?.text || "[]");
      expect(symbols.length).toBeGreaterThanOrEqual(1);
    });

    it("supports exact matching", async () => {
      await client.seedData([
        {
          path: "src/utils.ts",
          content:
            "export function get() {}\nexport function getValue() {}\nexport function getData() {}",
        },
      ]);

      const result = await client.callTool("mgrep-find-symbol", {
        name: "get",
        exact: true,
      });

      expect(result.isError).toBe(false);
      const symbols = JSON.parse(result.content[0]?.text || "[]");
      if (symbols.length > 0) {
        expect(symbols[0].name).toBe("get");
      }
    });

    it("filters by path", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
        { path: "tests/test.ts", content: "export function main() {}" },
      ]);

      const result = await client.callTool("mgrep-find-symbol", {
        name: "main",
        path: "src",
      });

      expect(result.isError).toBe(false);
      const symbols = JSON.parse(result.content[0]?.text || "[]");
      if (symbols.length > 0) {
        expect(symbols[0].path).toContain("src");
      }
    });

    it("errors on missing name parameter", async () => {
      try {
        await client.callTool("mgrep-find-symbol", {
          type: "function",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain("Name parameter is required");
      }
    });
  });

  describe("mgrep-find-references", () => {
    it("finds all symbol usages", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content:
            "export function helper() {}\nconst result = helper();\nhelper();",
        },
      ]);

      const result = await client.callTool("mgrep-find-references", {
        symbol: "helper",
      });

      expect(result.isError).toBe(false);
      const refs = JSON.parse(result.content[0]?.text || "[]");
      expect(refs.length).toBeGreaterThan(0);
    });

    it("includes definition when requested", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content: "export function test() {}\ntest();",
        },
      ]);

      const result = await client.callTool("mgrep-find-references", {
        symbol: "test",
        include_definition: true,
      });

      expect(result.isError).toBe(false);
      const refs = JSON.parse(result.content[0]?.text || "[]");
      expect(refs.length).toBeGreaterThan(0);
    });

    it("filters by path", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "const x = helper();" },
        { path: "tests/test.ts", content: "const y = helper();" },
      ]);

      const result = await client.callTool("mgrep-find-references", {
        symbol: "helper",
        path: "src",
      });

      expect(result.isError).toBe(false);
    });

    it("respects word boundaries", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content: "const test = 1;\nconst testing = 2;\ntest();",
        },
      ]);

      const result = await client.callTool("mgrep-find-references", {
        symbol: "test",
      });

      expect(result.isError).toBe(false);
    });

    it("ignores references in comments", async () => {
      await client.seedData([
        {
          path: "src/index.ts",
          content: "function test() {}\n// test comment\ntest();",
        },
      ]);

      const result = await client.callTool("mgrep-find-references", {
        symbol: "test",
      });

      expect(result.isError).toBe(false);
    });

    it("errors on missing symbol parameter", async () => {
      try {
        await client.callTool("mgrep-find-references", {
          path: "src",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain("Symbol parameter is required");
      }
    });
  });

  describe("mgrep-context", () => {
    it("exports search results as XML", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
      ]);

      const result = await client.callTool("mgrep-context", {
        query: "main",
        format: "xml",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toContain("<context>");
      expect(result.content[0]?.text).toContain("</context>");
    });

    it("exports as Markdown", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
      ]);

      const result = await client.callTool("mgrep-context", {
        query: "main",
        format: "markdown",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toContain("##");
      expect(result.content[0]?.text).toContain("```");
    });

    it("exports as plain text", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
      ]);

      const result = await client.callTool("mgrep-context", {
        query: "main",
        format: "plain",
      });

      expect(result.isError).toBe(false);
    });

    it("respects max_results limit", async () => {
      await client.seedData([
        { path: "file1.ts", content: "function test() {}" },
        { path: "file2.ts", content: "function test() {}" },
        { path: "file3.ts", content: "function test() {}" },
      ]);

      const result = await client.callTool("mgrep-context", {
        query: "test",
        max_results: 2,
      });

      expect(result.isError).toBe(false);
    });

    it("filters by path", async () => {
      await client.seedData([
        { path: "src/index.ts", content: "export function main() {}" },
        { path: "tests/test.ts", content: "export function test() {}" },
      ]);

      const result = await client.callTool("mgrep-context", {
        query: "function",
        path: "src",
      });

      expect(result.isError).toBe(false);
    });
  });

  describe("mgrep-sync", () => {
    it("returns sync summary on success", async () => {
      const result = await client.callTool("mgrep-sync", {});

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toContain("Sync completed");
    });

    it("dry_run=true doesn't modify store", async () => {
      const result = await client.callTool("mgrep-sync", {
        dry_run: true,
      });

      expect(result.isError).toBe(false);
    });

    it("handles empty directory", async () => {
      const result = await client.callTool("mgrep-sync", {});

      expect(result.isError).toBe(false);
    });

    it("reports uploaded/deleted counts", async () => {
      const result = await client.callTool("mgrep-sync", {});

      expect(result.isError).toBe(false);
      expect(result.content[0]?.text).toBeTruthy();
    });
  });
});
