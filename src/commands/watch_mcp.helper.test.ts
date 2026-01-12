import { describe, expect, it } from "vitest";
import type {
  AskResponse,
  ChunkType,
  SearchResponse,
  TextChunk,
} from "../lib/store.js";
import {
  extractSources,
  formatAskResultsForMcp,
  formatChunkForMcp,
  formatSearchResultsForMcp,
  getPromptMessage,
  isWebResult,
} from "./watch_mcp.js";

describe("Helper Functions", () => {
  describe("isWebResult", () => {
    it("should return true for web result chunks", () => {
      const webChunk: TextChunk = {
        type: "text",
        text: "Web content",
        score: 0.9,
        filename: "https://example.com",
        metadata: { path: "https://example.com", hash: "" },
        chunk_index: 0,
        generated_metadata: { start_line: 0, num_lines: 1 },
      };
      expect(isWebResult(webChunk)).toBe(true);
    });

    it("should return false for local file chunks", () => {
      const localChunk: TextChunk = {
        type: "text",
        text: "Local content",
        score: 0.9,
        filename: "/path/to/file.ts",
        metadata: { path: "/path/to/file.ts", hash: "abc123" },
        chunk_index: 0,
        generated_metadata: { start_line: 10, num_lines: 5 },
      };
      expect(isWebResult(localChunk)).toBe(false);
    });

    it("should return false for chunks without filename", () => {
      const chunk: ChunkType = {
        type: "text",
        text: "Content",
        score: 0.9,
        metadata: { path: "/path/to/file.ts", hash: "abc123" },
        chunk_index: 0,
        generated_metadata: { start_line: 10, num_lines: 5 },
      };
      expect(isWebResult(chunk)).toBe(false);
    });
  });

  describe("formatChunkForMcp", () => {
    it("should format web results correctly", () => {
      const webChunk: TextChunk & { filename: string } = {
        type: "text",
        text: "Web content",
        score: 0.85,
        filename: "https://example.com/page",
        metadata: { path: "https://example.com/page", hash: "" },
        chunk_index: 0,
        generated_metadata: { start_line: 0, num_lines: 1 },
      };
      const result = formatChunkForMcp(webChunk, false, "/home/user/project");
      expect(result).toContain("[Web]");
      expect(result).toContain("https://example.com/page");
      expect(result).toContain("85.00% match");
    });

    it("should format local text chunks with line ranges", () => {
      const localChunk: TextChunk = {
        type: "text",
        text: "Local content",
        score: 0.92,
        metadata: { path: "/home/user/project/src/file.ts", hash: "abc123" },
        chunk_index: 0,
        generated_metadata: { start_line: 10, num_lines: 5 },
      };
      const result = formatChunkForMcp(localChunk, false, "/home/user/project");
      expect(result).toContain("./src/file.ts");
      expect(result).toContain(":11-16");
      expect(result).toContain("92.00% match");
    });

    it("should include content when requested", () => {
      const chunk: TextChunk = {
        type: "text",
        text: "function test() { return 42; }",
        score: 0.95,
        metadata: { path: "/home/user/project/src/test.ts", hash: "abc123" },
        chunk_index: 0,
        generated_metadata: { start_line: 5, num_lines: 1 },
      };
      const result = formatChunkForMcp(chunk, true, "/home/user/project");
      expect(result).toContain("Content:");
      expect(result).toContain("function test() { return 42; }");
    });

    it("should handle image_url chunks", () => {
      const imageChunk: ChunkType = {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc" },
        score: 0.88,
        metadata: { path: "/home/user/project/doc.pdf", hash: "abc123" },
        chunk_index: 2,
        generated_metadata: { type: "pdf" },
      };
      const result = formatChunkForMcp(imageChunk, false, "/home/user/project");
      expect(result).toContain("./doc.pdf");
      expect(result).toContain("page 3");
      expect(result).toContain("88.00% match");
    });
  });

  describe("formatSearchResultsForMcp", () => {
    it("should format empty results", () => {
      const response: SearchResponse = { data: [] };
      const result = formatSearchResultsForMcp(response, false);
      expect(result).toBe("No results found.");
    });

    it("should format multiple results with numbering", () => {
      const response: SearchResponse = {
        data: [
          {
            type: "text",
            text: "Result 1",
            score: 0.9,
            metadata: { path: "/project/file1.ts", hash: "abc" },
            chunk_index: 0,
            generated_metadata: { start_line: 10, num_lines: 5 },
          },
          {
            type: "text",
            text: "Result 2",
            score: 0.8,
            metadata: { path: "/project/file2.ts", hash: "def" },
            chunk_index: 0,
            generated_metadata: { start_line: 20, num_lines: 3 },
          },
        ],
      };
      const result = formatSearchResultsForMcp(response, false);
      expect(result).toContain("Found 2 result(s):");
      expect(result).toContain("1. ");
      expect(result).toContain("2. ");
    });
  });

  describe("extractSources", () => {
    it("should extract single citation sources", () => {
      const response: AskResponse = {
        answer: 'The function is defined <cite i="0">here</cite>.',
        sources: [
          {
            type: "text",
            text: "function test() {}",
            score: 0.9,
            metadata: { path: "/project/test.ts", hash: "abc" },
            chunk_index: 0,
            generated_metadata: { start_line: 5, num_lines: 1 },
          },
        ],
      };
      const sources = extractSources(response);
      expect(sources[0]).toBeDefined();
      if (sources[0].type === "text") {
        expect(sources[0].text).toBe("function test() {}");
      }
    });

    it("should extract range citation sources", () => {
      const response: AskResponse = {
        answer: 'Multiple sources <cite i="0-2">support this</cite>.',
        sources: [
          {
            type: "text",
            text: "Source 1",
            score: 0.9,
            metadata: { path: "/project/file1.ts", hash: "abc" },
            chunk_index: 0,
            generated_metadata: { start_line: 1, num_lines: 1 },
          },
          {
            type: "text",
            text: "Source 2",
            score: 0.8,
            metadata: { path: "/project/file2.ts", hash: "def" },
            chunk_index: 0,
            generated_metadata: { start_line: 1, num_lines: 1 },
          },
          {
            type: "text",
            text: "Source 3",
            score: 0.7,
            metadata: { path: "/project/file3.ts", hash: "ghi" },
            chunk_index: 0,
            generated_metadata: { start_line: 1, num_lines: 1 },
          },
        ],
      };
      const sources = extractSources(response);
      expect(sources[0]).toBeDefined();
      expect(sources[1]).toBeDefined();
      expect(sources[2]).toBeDefined();
    });

    it("should handle invalid citation indices", () => {
      const response: AskResponse = {
        answer: 'Invalid <cite i="99">citation</cite>.',
        sources: [
          {
            type: "text",
            text: "Source 1",
            score: 0.9,
            metadata: { path: "/project/file.ts", hash: "abc" },
            chunk_index: 0,
            generated_metadata: { start_line: 1, num_lines: 1 },
          },
        ],
      };
      const sources = extractSources(response);
      expect(sources[99]).toBeUndefined();
    });

    it("should handle answers with no citations", () => {
      const response: AskResponse = {
        answer: "No citations in this answer.",
        sources: [],
      };
      const sources = extractSources(response);
      expect(Object.keys(sources)).toHaveLength(0);
    });
  });

  describe("formatAskResultsForMcp", () => {
    it("should format answer with sources", () => {
      const response: AskResponse = {
        answer: 'The answer is <cite i="0">here</cite>.',
        sources: [
          {
            type: "text",
            text: "Source content",
            score: 0.9,
            metadata: { path: "/project/file.ts", hash: "abc" },
            chunk_index: 0,
            generated_metadata: { start_line: 10, num_lines: 5 },
          },
        ],
      };
      const result = formatAskResultsForMcp(response);
      expect(result).toContain('The answer is <cite i="0">here</cite>.');
      expect(result).toContain("Sources:");
      expect(result).toContain("[0]");
    });

    it("should handle answers with no cited sources", () => {
      const response: AskResponse = {
        answer: "Answer without citations.",
        sources: [
          {
            type: "text",
            text: "Unused source",
            score: 0.9,
            metadata: { path: "/project/file.ts", hash: "abc" },
            chunk_index: 0,
            generated_metadata: { start_line: 10, num_lines: 5 },
          },
        ],
      };
      const result = formatAskResultsForMcp(response);
      expect(result).toContain("Answer without citations.");
      expect(result).toContain("Sources:");
    });
  });

  describe("getPromptMessage", () => {
    it("should return codebase-overview message", () => {
      const message = getPromptMessage("codebase-overview", undefined);
      expect(message).toContain("Analyze this codebase");
      expect(message).toContain("mgrep-stats");
      expect(message).toContain("mgrep-list-files");
    });

    it("should return find-implementation message with feature", () => {
      const message = getPromptMessage("find-implementation", {
        feature: "authentication",
      });
      expect(message).toContain("authentication");
      expect(message).toContain("mgrep-search");
      expect(message).toContain("mgrep-find-symbol");
    });

    it("should return debug-flow message with entrypoint", () => {
      const message = getPromptMessage("debug-flow", {
        entrypoint: "processRequest",
      });
      expect(message).toContain("processRequest");
      expect(message).toContain("execution flow");
    });

    it("should return find-similar-code message with code", () => {
      const message = getPromptMessage("find-similar-code", {
        code: "function test() {}",
      });
      expect(message).toContain("function test() {}");
      expect(message).toContain("similar code");
    });

    it("should throw error for unknown prompt names", () => {
      expect(() => getPromptMessage("unknown-prompt", undefined)).toThrow(
        "Unknown prompt: unknown-prompt",
      );
    });

    it("should handle missing arguments with defaults", () => {
      const message = getPromptMessage("find-implementation", undefined);
      expect(message).toContain("unknown feature");
    });
  });
});
