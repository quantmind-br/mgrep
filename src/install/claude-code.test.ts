import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node modules
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn),
}));

vi.mock("commander", () => ({
  Command: vi.fn(() => ({
    description: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
  })),
}));

// Import after mocks
import { exec } from "node:child_process";
import { installClaudeCode, uninstallClaudeCode } from "./claude-code.js";

describe("claude-code installer", () => {
  let mockExec: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = vi.mocked(exec);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("installClaudeCode", () => {
    it("should install plugin successfully", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installClaudeCode.parseAsync([]);

      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin marketplace add mixedbread-ai/mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin install mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully installed the mgrep plugin",
      );

      consoleSpy.mockRestore();
    });

    it("should handle marketplace already installed", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(new Error("already installed"), { stdout: "", stderr: "" });
      }) as any);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installClaudeCode.parseAsync([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Marketplace plugin already installed, continuing...",
      );

      consoleSpy.mockRestore();
    });

    it("should handle plugin already installed", async () => {
      const execCalls: any[] = [];
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        execCalls.push(_cmd);
        if (execCalls.length === 1) {
          callback(null, { stdout: "", stderr: "" });
        } else {
          callback(new Error("already installed"), { stdout: "", stderr: "" });
        }
      }) as any);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installClaudeCode.parseAsync([]);

      expect(consoleSpy).toHaveBeenCalledWith("Plugin already installed");

      consoleSpy.mockRestore();
    });

    it("should handle installation errors", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(new Error("Installation failed"), { stdout: "", stderr: "" });
      }) as any);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      try {
        await installClaudeCode.parseAsync([]);
      } catch (e) {
        // Expected to throw
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error installing plugin"),
      );

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe("uninstallClaudeCode", () => {
    it("should uninstall plugin successfully", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallClaudeCode.parseAsync([]);

      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin uninstall mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
      );
      expect(mockExec).toHaveBeenCalledWith(
        "claude plugin marketplace remove mixedbread-ai/mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully uninstalled the mgrep plugin",
      );

      consoleSpy.mockRestore();
    });

    it("should handle uninstall errors", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(new Error("Uninstall failed"), { stdout: "", stderr: "" });
      }) as any);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      try {
        await uninstallClaudeCode.parseAsync([]);
      } catch (e) {
        // Expected to throw
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error uninstalling plugin"),
      );

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
