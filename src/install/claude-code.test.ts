import type { ExecException } from "node:child_process";
import { exec } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExecCallback = (
  error: ExecException | null,
  result: { stdout: string; stderr: string } | null,
) => void;

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn(
    (fn: typeof exec) =>
      (...args: Parameters<typeof exec>) =>
        new Promise((resolve, reject) => {
          (fn as any)(...args, (err: Error | null, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        }),
  ),
}));

import { installClaudeCode, uninstallClaudeCode } from "./claude-code.js";

describe("claude-code installer", () => {
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = vi.mocked(exec);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("installClaudeCode", () => {
    it("should install plugin successfully", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      await installClaudeCode.parseAsync(["node", "test"]);

      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin marketplace add mixedbread-ai/mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
        expect.any(Function),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin install mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
        expect.any(Function),
      );
      expect(console.log).toHaveBeenCalledWith(
        "Successfully installed the mgrep plugin",
      );
    });

    it("should handle marketplace already installed", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error("already installed"), null);
        },
      );

      await installClaudeCode.parseAsync(["node", "test"]);

      expect(console.log).toHaveBeenCalledWith(
        "Marketplace plugin already installed, continuing...",
      );
    });

    it("should handle plugin already installed", async () => {
      let callCount = 0;
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callCount++;
          if (callCount === 1) {
            callback(null, { stdout: "", stderr: "" });
          } else {
            callback(new Error("already installed"), null);
          }
        },
      );

      await installClaudeCode.parseAsync(["node", "test"]);

      expect(console.log).toHaveBeenCalledWith("Plugin already installed");
    });

    it("should handle installation errors", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error("Installation failed"), null);
        },
      );

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      await installClaudeCode.parseAsync(["node", "test"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error installing plugin"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("uninstallClaudeCode", () => {
    it("should uninstall plugin successfully", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      await uninstallClaudeCode.parseAsync(["node", "test"]);

      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin uninstall mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
        expect.any(Function),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin marketplace remove mixedbread-ai/mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
        expect.any(Function),
      );
      expect(console.log).toHaveBeenCalledWith(
        "Successfully uninstalled the mgrep plugin",
      );
    });

    it("should handle uninstall errors", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error("Uninstall failed"), null);
        },
      );

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      await uninstallClaudeCode.parseAsync(["node", "test"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error uninstalling plugin"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
