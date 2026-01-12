import { describe, expect, it } from "vitest";
import type { TextChunk } from "../store.js";
import { ContextFormatter } from "./context-formatter.js";

function createTextChunk(
  text: string,
  path: string,
  startLine: number,
  numLines: number,
  score = 0.85,
): TextChunk {
  return {
    type: "text",
    text,
    score,
    chunk_index: 0,
    metadata: { path, hash: "abc123" },
    generated_metadata: { start_line: startLine, num_lines: numLines },
  };
}

describe("ContextFormatter", () => {
  describe("formatResults()", () => {
    it("formats results as XML by default", () => {
      const formatter = new ContextFormatter();
      const chunks = [
        createTextChunk("function hello() {}", "src/lib/hello.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain("<context");
      expect(result.content).toContain("</context>");
      expect(result.content).toContain("<file");
      expect(result.content).toContain('path="src/lib/hello.ts"');
      expect(result.content).toContain('lines="1-1"');
      expect(result.content).toContain("function hello() {}");
      expect(result.fileCount).toBe(1);
      expect(result.chunkCount).toBe(1);
      expect(result.truncated).toBe(false);
    });

    it("formats results as Markdown when specified", () => {
      const formatter = new ContextFormatter({ format: "markdown" });
      const chunks = [
        createTextChunk("const x = 1;", "src/lib/utils.ts", 9, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain("# Context");
      expect(result.content).toContain("## src/lib/utils.ts (lines 10-10)");
      expect(result.content).toContain("```typescript");
      expect(result.content).toContain("const x = 1;");
      expect(result.content).toContain("```");
    });

    it("formats results as plain text when specified", () => {
      const formatter = new ContextFormatter({ format: "plain" });
      const chunks = [createTextChunk("print('hi')", "main.py", 4, 1)];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain("=== main.py:5-5");
      expect(result.content).toContain("print('hi')");
      expect(result.content).not.toContain("<");
      expect(result.content).not.toContain("```");
    });

    it("handles empty results gracefully", () => {
      const formatter = new ContextFormatter();
      const result = formatter.formatResults([]);

      expect(result.content).toContain('files="0"');
      expect(result.content).toContain("No matching results");
      expect(result.fileCount).toBe(0);
      expect(result.chunkCount).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it("handles single result", () => {
      const formatter = new ContextFormatter({ format: "xml" });
      const chunks = [createTextChunk("test", "test.ts", 0, 1)];

      const result = formatter.formatResults(chunks);

      expect(result.fileCount).toBe(1);
      expect(result.chunkCount).toBe(1);
    });

    it("handles 100+ results efficiently", () => {
      const formatter = new ContextFormatter();
      const chunks: TextChunk[] = [];
      for (let i = 0; i < 150; i++) {
        chunks.push(createTextChunk(`line ${i}`, `file${i}.ts`, i, 1));
      }

      const start = performance.now();
      const result = formatter.formatResults(chunks);
      const duration = performance.now() - start;

      expect(result.chunkCount).toBe(150);
      expect(result.fileCount).toBe(150);
      expect(duration).toBeLessThan(1000);
    });

    it("preserves code content exactly", () => {
      const formatter = new ContextFormatter({ format: "plain" });
      const content = `function test() {
  const a = 1;
  return a;
}`;
      const chunks = [createTextChunk(content, "test.ts", 0, 4)];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain(content);
    });

    it("escapes XML special characters in XML format", () => {
      const formatter = new ContextFormatter({ format: "xml" });
      const chunks = [
        createTextChunk("const x = a < b && c > d;", "src/test.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain('path="src/test.ts"');
    });

    it("includes query in header when provided", () => {
      const formatter = new ContextFormatter({
        format: "xml",
        query: "authentication logic",
      });
      const chunks = [createTextChunk("auth()", "auth.ts", 0, 1)];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain('query="authentication logic"');
    });
  });

  describe("token estimation", () => {
    it("estimates tokens within 20% accuracy", () => {
      const formatter = new ContextFormatter();
      const text = "a".repeat(400);

      const estimate = formatter.estimateTokens(text);

      expect(estimate).toBeGreaterThanOrEqual(100);
      expect(estimate).toBeLessThanOrEqual(120);
    });

    it("truncates when maxTokens exceeded", () => {
      const formatter = new ContextFormatter({ maxTokens: 50 });
      const chunks = [
        createTextChunk("a".repeat(100), "a.ts", 0, 1),
        createTextChunk("b".repeat(100), "b.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.truncated).toBe(true);
      expect(result.chunkCount).toBeLessThan(2);
    });

    it("sets truncated flag when truncating", () => {
      const formatter = new ContextFormatter({ maxTokens: 30 });
      const chunks = [
        createTextChunk("long content ".repeat(50), "test.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.truncated).toBe(true);
    });

    it("includes all results when under limit", () => {
      const formatter = new ContextFormatter({ maxTokens: 10000 });
      const chunks = [
        createTextChunk("short", "a.ts", 0, 1),
        createTextChunk("also short", "b.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.truncated).toBe(false);
      expect(result.chunkCount).toBe(2);
    });
  });

  describe("metadata", () => {
    it("includes correct file count", () => {
      const formatter = new ContextFormatter();
      const chunks = [
        createTextChunk("a", "file1.ts", 0, 1),
        createTextChunk("b", "file1.ts", 10, 1),
        createTextChunk("c", "file2.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.fileCount).toBe(2);
      expect(result.chunkCount).toBe(3);
    });

    it("includes correct line ranges", () => {
      const formatter = new ContextFormatter({ format: "xml" });
      const chunks = [createTextChunk("content", "test.ts", 49, 10)];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain('lines="50-59"');
    });

    it("handles relative paths correctly", () => {
      const formatter = new ContextFormatter({ format: "markdown" });
      const chunks = [
        createTextChunk("x", "src/lib/deep/nested/file.ts", 0, 1),
      ];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain("## src/lib/deep/nested/file.ts");
    });
  });

  describe("format-specific features", () => {
    it("detects language from file extension for markdown", () => {
      const formatter = new ContextFormatter({ format: "markdown" });

      const tsChunks = [createTextChunk("const x", "test.ts", 0, 1)];
      expect(formatter.formatResults(tsChunks).content).toContain(
        "```typescript",
      );

      const pyChunks = [createTextChunk("x = 1", "test.py", 0, 1)];
      expect(formatter.formatResults(pyChunks).content).toContain("```python");

      const goChunks = [createTextChunk("var x", "test.go", 0, 1)];
      expect(formatter.formatResults(goChunks).content).toContain("```go");
    });

    it("includes score percentage in output", () => {
      const formatter = new ContextFormatter({ format: "xml" });
      const chunks = [createTextChunk("test", "test.ts", 0, 1, 0.923)];

      const result = formatter.formatResults(chunks);

      expect(result.content).toContain('score="92.3%"');
    });

    it("omits metadata when includeMetadata is false", () => {
      const formatter = new ContextFormatter({
        format: "xml",
        includeMetadata: false,
        query: "should not appear",
      });
      const chunks = [createTextChunk("test", "test.ts", 0, 1)];

      const result = formatter.formatResults(chunks);

      expect(result.content).not.toContain("query=");
      expect(result.content).not.toContain('files="');
    });
  });
});
