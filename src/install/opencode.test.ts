import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
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

vi.mock("./skill.js", () => ({
  getSkillVersionShort: vi.fn(() => "abc12345"),
  loadSkill: vi.fn(
    () => "---\nname: mgrep\ndescription: Test skill\n---\nSkill content",
  ),
}));

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
      mockReadFileSync.mockReturnValue("{}");

      await installOpencode.parseAsync(["node", "test"]);

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Successfully installed mgrep tool"),
      );
      expect(console.log).toHaveBeenCalledWith(
        "Successfully configured mgrep MCP server in OpenCode",
      );
    });

    it("should update existing config file", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: { other: { type: "local", command: ["other"], enabled: true } },
        }),
      );

      await installOpencode.parseAsync(["node", "test"]);

      const writeCalls = mockWriteFileSync.mock.calls;
      const configWrite = writeCalls.find((call: any) =>
        String(call[0]).includes("opencode.json"),
      );

      if (configWrite) {
        const content = JSON.parse(configWrite[1]);
        expect(content.mcp.mgrep).toBeDefined();
        expect(content.mcp.other).toBeDefined();
      }
    });

    it("should create config with schema if missing", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({}));

      await installOpencode.parseAsync(["node", "test"]);

      const writeCalls = mockWriteFileSync.mock.calls;
      const configWrite = writeCalls.find((call: any) =>
        String(call[0]).includes("opencode.json"),
      );

      if (configWrite) {
        const content = JSON.parse(configWrite[1]);
        expect(content.$schema).toBe("https://opencode.ai/config.json");
        expect(content.mcp.mgrep).toBeDefined();
      }
    });

    it("should handle installation errors", async () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error("Write failed");
      });

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      await installOpencode.parseAsync(["node", "test"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error installing tool"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("uninstallOpencode", () => {
    it("should uninstall tool successfully", async () => {
      const configJson = {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          mgrep: { type: "local", command: ["mgrep", "mcp"], enabled: true },
          other: { type: "local", command: ["other"], enabled: true },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(configJson));
      mockUnlinkSync.mockImplementation(() => {});
      mockWriteFileSync.mockImplementation(() => {});

      await uninstallOpencode.parseAsync(["node", "test"]);

      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();

      const writeCalls = mockWriteFileSync.mock.calls;
      const configWrite = writeCalls.find((call: any) =>
        String(call[0]).includes("opencode.json"),
      );

      expect(configWrite).toBeDefined();
      const content = JSON.parse(configWrite[1]);
      expect(content.mcp.mgrep).toBeUndefined();
      expect(content.mcp.other).toBeDefined();
    });

    it("should handle missing tool file", async () => {
      mockExistsSync.mockReturnValue(false);

      await uninstallOpencode.parseAsync(["node", "test"]);

      expect(console.log).toHaveBeenCalledWith(
        "The mgrep tool is not installed in the OpenCode agent",
      );
    });

    it("should handle missing config file", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (String(path).includes("tool")) return true;
        if (String(path).includes("opencode.json")) return false;
        return false;
      });

      await uninstallOpencode.parseAsync(["node", "test"]);

      expect(mockUnlinkSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        "The mgrep is not installed in the OpenCode agent",
      );
    });

    it("should handle uninstall errors", async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error("Delete failed");
      });

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((() => {}) as any);

      await uninstallOpencode.parseAsync(["node", "test"]);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error uninstalling plugin"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
