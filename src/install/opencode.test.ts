import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
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
import * as fs from "node:fs";
import { installOpencode, uninstallOpencode } from "./opencode.js";

describe("opencode installer", () => {
  let mockExistsSync: any;
  let mockReadFileSync: any;
  let mockWriteFileSync: any;
  let mockMkdirSync: any;
  let mockUnlinkSync: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync = vi.mocked(fs.existsSync);
    mockReadFileSync = vi.mocked(fs.readFileSync);
    mockWriteFileSync = vi.mocked(fs.writeFileSync);
    mockMkdirSync = vi.mocked(fs.mkdirSync);
    mockUnlinkSync = vi.mocked(fs.unlinkSync);

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("installOpencode", () => {
    it("should install tool successfully", async () => {
      mockExistsSync.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installOpencode.parseAsync([]);

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Successfully installed mgrep tool"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Successfully configured mgrep MCP server in OpenCode",
      );

      consoleSpy.mockRestore();
    });

    it("should update existing config file", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: { other: { type: "local", command: ["other"], enabled: true } },
        }),
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installOpencode.parseAsync([]);

      const writeCalls = mockWriteFileSync.mock.calls;
      const configWrite = writeCalls.find((call) =>
        String(call[0]).includes("opencode.json"),
      );

      if (configWrite) {
        const content = JSON.parse(configWrite[1]);
        expect(content.mcp.mgrep).toBeDefined();
        expect(content.mcp.other).toBeDefined();
      }

      consoleSpy.mockRestore();
    });

    it("should create config with schema if missing", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installOpencode.parseAsync([]);

      const writeCalls = mockWriteFileSync.mock.calls;
      const configWrite = writeCalls.find((call) =>
        String(call[0]).includes("opencode.json"),
      );

      if (configWrite) {
        const content = JSON.parse(configWrite[1]);
        expect(content.$schema).toBe("https://opencode.ai/config.json");
        expect(content.mcp.mgrep).toBeDefined();
      }

      consoleSpy.mockRestore();
    });

    it("should handle installation errors", async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error("Write failed");
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      try {
        await installOpencode.parseAsync([]);
      } catch (e) {
        // Expected
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error installing tool"),
      );

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe("uninstallOpencode", () => {
    it("should uninstall tool successfully", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            mgrep: { type: "local", command: ["mgrep", "mcp"], enabled: true },
            other: { type: "local", command: ["other"], enabled: true },
          },
        }),
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallOpencode.parseAsync([]);

      expect(mockUnlinkSync).toHaveBeenCalled();

      const writeCalls = mockWriteFileSync.mock.calls;
      const configWrite = writeCalls.find((call) =>
        String(call[0]).includes("opencode.json"),
      );

      if (configWrite) {
        const content = JSON.parse(configWrite[1]);
        expect(content.mcp.mgrep).toBeUndefined();
        expect(content.mcp.other).toBeDefined();
      }

      consoleSpy.mockRestore();
    });

    it("should handle missing tool file", async () => {
      mockExistsSync.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallOpencode.parseAsync([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "The mgrep tool is not installed in the OpenCode agent",
      );

      consoleSpy.mockRestore();
    });

    it("should handle missing config file", async () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes("tool")) return true;
        if (String(path).includes("opencode.json")) return false;
        return false;
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallOpencode.parseAsync([]);

      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "The mgrep is not installed in the OpenCode agent",
      );

      consoleSpy.mockRestore();
    });

    it("should handle uninstall errors", async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error("Delete failed");
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      try {
        await uninstallOpencode.parseAsync([]);
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
