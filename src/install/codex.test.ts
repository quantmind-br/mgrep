import type { ExecException } from "node:child_process";
import { exec } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExecCallback = (
  error: ExecException | null,
  result: { stdout: string; stderr: string } | null,
) => void;

// Mock node modules
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:fs", () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
  return { ...mock, default: mock };
});

vi.mock("node:os", () => {
  const mock = { homedir: vi.fn(() => "/home/user") };
  return { ...mock, default: mock };
});

vi.mock("node:path", () => {
  const mock = {
    join: vi.fn((...args: string[]) => args.join("/")),
    dirname: vi.fn((p: string) => p.substring(0, p.lastIndexOf("/"))),
  };
  return { ...mock, default: mock };
});

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

vi.mock("./skill.js", () => ({
  getSkillVersionShort: vi.fn(() => "abc12345"),
  loadSkill: vi.fn(
    () => "---\nname: mgrep\ndescription: Test skill\n---\nSkill content",
  ),
}));

// Import after mocks
import * as fs from "node:fs";
import { installCodex, uninstallCodex } from "./codex.js";

describe("codex installer", () => {
  let mockExec: ReturnType<typeof vi.fn>;
  let mockExistsSync: any;
  let mockReadFileSync: any;
  let mockAppendFileSync: any;
  let mockMkdirSync: any;
  let mockUnlinkSync: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = vi.mocked(exec);
    mockExistsSync = vi.mocked(fs.existsSync);
    mockReadFileSync = vi.mocked(fs.readFileSync);
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
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      mockExistsSync.mockReturnValue(false);

      await installCodex.parseAsync(["node", "test"]);

      expect(mockExec).toHaveBeenCalledWith(
        "codex mcp add mgrep mgrep mcp",
        expect.objectContaining({ shell: expect.any(String) }),
        expect.any(Function),
      );
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockAppendFileSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        "Successfully installed the mgrep background sync",
      );
    });

    it("should skip skill if already installed", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("---\nname: mgrep\ndescription: Test\n");

      await installCodex.parseAsync(["node", "test"]);

      expect(console.log).toHaveBeenCalledWith(
        "The mgrep skill is already installed in the Codex agent",
      );
    });

    it("should handle installation errors", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error("Install failed"), null);
        },
      );

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      await installCodex.parseAsync(["node", "test"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error installing plugin"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("uninstallCodex", () => {
    it("should uninstall plugin successfully", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("---\nname: mgrep\ntest\n---\nother\n");

      await installCodex.parseAsync(["node", "test"]);

      await uninstallCodex.parseAsync(["node", "test"]);

      expect(mockExec).toHaveBeenCalledWith(
        "codex mcp remove mgrep",
        expect.objectContaining({ shell: expect.any(String) }),
        expect.any(Function),
      );
    });

    it("should delete file if empty after removal", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("---\nname: mgrep\ntest\n");

      await uninstallCodex.parseAsync(["node", "test"]);

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it("should handle missing AGENTS.md gracefully", async () => {
      mockExec.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, { stdout: "", stderr: "" });
        },
      );

      mockExistsSync.mockReturnValue(false);

      await uninstallCodex.parseAsync(["node", "test"]);

      expect(console.log).toHaveBeenCalledWith(
        "Successfully removed the mgrep from the Codex agent",
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

      await uninstallCodex.parseAsync(["node", "test"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error uninstalling plugin"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
