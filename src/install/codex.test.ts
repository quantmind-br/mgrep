import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node modules
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/user"),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
  dirname: vi.fn((path) => path.substring(0, path.lastIndexOf("/"))),
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

vi.mock("./skill.js", () => ({
  getSkillVersionShort: vi.fn(() => "abc12345"),
  loadSkill: vi.fn(
    () => "---\nname: mgrep\ndescription: Test skill\n---\nSkill content",
  ),
}));

// Import after mocks
import { exec } from "node:child_process";
import * as fs from "node:fs";
import { installCodex, uninstallCodex } from "./codex.js";

describe("codex installer", () => {
  let mockExec: any;
  let mockExistsSync: any;
  let mockReadFileSync: any;
  let mockWriteFileSync: any;
  let mockAppendFileSync: any;
  let mockMkdirSync: any;
  let mockUnlinkSync: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = vi.mocked(exec);
    mockExistsSync = vi.mocked(fs.existsSync);
    mockReadFileSync = vi.mocked(fs.readFileSync);
    mockWriteFileSync = vi.mocked(fs.writeFileSync);
    mockAppendFileSync = vi.mocked(fs.appendFileSync);
    mockMkdirSync = vi.mocked(fs.mkdirSync);
    mockUnlinkSync = vi.mocked(fs.unlinkSync);

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("installCodex", () => {
    it("should install plugin successfully", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      mockExistsSync.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installCodex.parseAsync([]);

      expect(mockExec).toHaveBeenCalledWith(
        "codex mcp add mgrep mgrep mcp",
        expect.objectContaining({ shell: expect.any(String) }),
      );
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockAppendFileSync).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully installed the mgrep background sync",
      );

      consoleSpy.mockRestore();
    });

    it("should skip skill if already installed", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("---\nname: mgrep\ndescription: Test\n");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installCodex.parseAsync([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "The mgrep skill is already installed in the Codex agent",
      );

      consoleSpy.mockRestore();
    });

    it("should handle installation errors", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(new Error("Install failed"), { stdout: "", stderr: "" });
      }) as any);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      try {
        await installCodex.parseAsync([]);
      } catch (e) {
        // Expected
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error installing plugin"),
      );

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe("uninstallCodex", () => {
    it("should uninstall plugin successfully", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("---\nname: mgrep\ntest\n---\nother\n");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallCodex.parseAsync([]);

      expect(mockExec).toHaveBeenCalledWith(
        "codex mcp remove mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
      );
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully removed the mgrep from the Codex agent",
      );

      consoleSpy.mockRestore();
    });

    it("should delete file if empty after removal", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("---\nname: mgrep\ntest\n");

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallCodex.parseAsync([]);

      expect(mockUnlinkSync).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle missing AGENTS.md gracefully", async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
      }) as any);

      mockExistsSync.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallCodex.parseAsync([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully removed the mgrep from the Codex agent",
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
        await uninstallCodex.parseAsync([]);
      } catch (e) {
        // Expected
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error uninstalling plugin"),
      );

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
