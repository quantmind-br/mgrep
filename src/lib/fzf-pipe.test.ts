import { describe, it, expect, vi, beforeEach } from "vitest";
import { FzfPipe, type SearchResultForFzf } from "./fzf-pipe.js";

describe("FzfPipe", () => {
  let fzfPipe: FzfPipe;

  beforeEach(() => {
    fzfPipe = new FzfPipe();
  });

  describe("formatResults()", () => {
    it("formats results with path:line (score%) | preview", () => {
      const results: SearchResultForFzf[] = [
        {
          path: "src/lib/utils.ts",
          startLine: 10,
          endLine: 20,
          score: 0.85,
          preview: "function hello() {}",
        },
      ];

      const formatted = fzfPipe.formatResults(results);

      expect(formatted).toHaveLength(1);
      expect(formatted[0]).toContain("src/lib/utils.ts:10-20");
      expect(formatted[0]).toContain("(85.0%)");
      expect(formatted[0]).toContain("function hello() {}");
    });

    it("handles empty results", () => {
      const formatted = fzfPipe.formatResults([]);
      expect(formatted).toHaveLength(0);
    });

    it("truncates long preview text at 80 chars", () => {
      const longPreview = "a".repeat(100);
      const results: SearchResultForFzf[] = [
        {
          path: "test.ts",
          startLine: 1,
          endLine: 1,
          score: 0.5,
          preview: longPreview,
        },
      ];

      const formatted = fzfPipe.formatResults(results);
      const previewPart = formatted[0].split("|")[1].trim();

      expect(previewPart.length).toBe(80);
    });

    it("replaces newlines in preview with spaces", () => {
      const results: SearchResultForFzf[] = [
        {
          path: "test.ts",
          startLine: 1,
          endLine: 5,
          score: 0.9,
          preview: "line1\nline2\nline3",
        },
      ];

      const formatted = fzfPipe.formatResults(results);

      expect(formatted[0]).not.toContain("\n");
      expect(formatted[0]).toContain("line1 line2 line3");
    });
  });

  describe("isAvailable()", () => {
    it("is a static async method", async () => {
      const result = await FzfPipe.isAvailable();
      expect(typeof result).toBe("boolean");
    });
  });
});
