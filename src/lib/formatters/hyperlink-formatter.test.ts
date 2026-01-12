import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HyperlinkFormatter } from "./hyperlink-formatter.js";

describe("HyperlinkFormatter", () => {
  const originalEnv = process.env;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Make isTTY configurable for tests
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe("detectSupport()", () => {
    it("detects iTerm2", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      process.env.TERM_PROGRAM = "iTerm.app";

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(true);
    });

    it("detects WezTerm", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      process.env.TERM_PROGRAM = "WezTerm";

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(true);
    });

    it("detects VS Code terminal", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      process.env.TERM_PROGRAM = "vscode";

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(true);
    });

    it("detects Windows Terminal", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      process.env.WT_SESSION = "some-session-id";

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(true);
    });

    it("detects GNOME Terminal", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      process.env.GNOME_TERMINAL_SCREEN = "/org/gnome/Terminal";

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(true);
    });

    it("returns false for unsupported terminals", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      process.env = {};

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(false);
    });

    it("returns false when not a TTY", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        configurable: true,
      });
      process.env.TERM_PROGRAM = "iTerm.app";

      const formatter = new HyperlinkFormatter();
      expect(formatter.isEnabled()).toBe(false);
    });
  });

  describe("createLink()", () => {
    it("generates correct OSC 8 sequence when enabled", () => {
      const formatter = new HyperlinkFormatter(true);
      const link = formatter.createLink("https://example.com", "Example");

      expect(link).toContain("\u001B]8;;https://example.com");
      expect(link).toContain("Example");
      expect(link).toContain("\u001B]8;;");
    });

    it("returns plain text when disabled", () => {
      const formatter = new HyperlinkFormatter(false);
      const link = formatter.createLink("https://example.com", "Example");

      expect(link).toBe("Example");
      expect(link).not.toContain("\u001B");
    });
  });

  describe("formatFilePath()", () => {
    it("includes line fragment in file URL", () => {
      const formatter = new HyperlinkFormatter(true);
      const result = formatter.formatFilePath(
        "src/lib/test.ts",
        10,
        20,
        "/project",
      );

      expect(result).toContain("file:///project/src/lib/test.ts#10");
      expect(result).toContain("src/lib/test.ts:10-20");
    });

    it("returns plain path:line when disabled", () => {
      const formatter = new HyperlinkFormatter(false);
      const result = formatter.formatFilePath("src/lib/test.ts", 10, 20);

      expect(result).toBe("src/lib/test.ts:10-20");
      expect(result).not.toContain("\u001B");
    });

    it("handles absolute paths", () => {
      const formatter = new HyperlinkFormatter(true);
      const result = formatter.formatFilePath("/absolute/path/file.ts", 1, 5);

      expect(result).toContain("file:///absolute/path/file.ts#1");
    });
  });

  describe("formatPathWithScore()", () => {
    it("includes score percentage in output", () => {
      const formatter = new HyperlinkFormatter(false);
      const result = formatter.formatPathWithScore("test.ts", 1, 10, 0.876);

      expect(result).toContain("(87.60% match)");
      expect(result).toContain(".test.ts:1-10");
    });
  });
});
