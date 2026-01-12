import * as child_process from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("clipboard", () => {
  const mockSpawn = vi.mocked(child_process.spawn);

  beforeEach(() => {
    vi.resetModules();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("copyToClipboard", () => {
    it("copies text on macOS using pbcopy", async () => {
      vi.stubEnv("PLATFORM", "darwin");
      Object.defineProperty(process, "platform", { value: "darwin" });

      const mockProcess = {
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
          if (event === "close") {
            setTimeout(() => cb(0), 0);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(
        mockProcess as unknown as child_process.ChildProcess,
      );

      const { copyToClipboard } = await import("./clipboard.js");
      const result = await copyToClipboard("test text");

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith("pbcopy", [], expect.any(Object));
      expect(mockProcess.stdin.write).toHaveBeenCalledWith("test text");
      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });

    it("returns error when clipboard tool fails", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });

      const mockProcess = {
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
          if (event === "close") {
            setTimeout(() => cb(1), 0);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(
        mockProcess as unknown as child_process.ChildProcess,
      );

      const { copyToClipboard } = await import("./clipboard.js");
      const result = await copyToClipboard("test text");

      expect(result.success).toBe(false);
      expect(result.error).toContain("exited with code 1");
    });

    it("returns error when spawn fails", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });

      const mockProcess = {
        stdin: {
          write: vi.fn(),
          end: vi.fn(),
        },
        on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
          if (event === "error") {
            setTimeout(() => cb(new Error("Command not found")), 0);
          }
          return mockProcess;
        }),
      };
      mockSpawn.mockReturnValue(
        mockProcess as unknown as child_process.ChildProcess,
      );

      const { copyToClipboard } = await import("./clipboard.js");
      const result = await copyToClipboard("test text");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Command not found");
    });
  });

  describe("isClipboardAvailable", () => {
    it("returns true for darwin", async () => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const { isClipboardAvailable } = await import("./clipboard.js");
      expect(isClipboardAvailable()).toBe(true);
    });

    it("returns true for win32", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });
      const { isClipboardAvailable } = await import("./clipboard.js");
      expect(isClipboardAvailable()).toBe(true);
    });

    it("returns true for linux", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });
      const { isClipboardAvailable } = await import("./clipboard.js");
      expect(isClipboardAvailable()).toBe(true);
    });
  });
});
