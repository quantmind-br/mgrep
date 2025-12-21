import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/user"),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
  dirname: vi.fn((path) => path.substring(0, path.lastIndexOf("/"))),
}));

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn((url) => "/test/path.js"),
}));

vi.mock("commander", () => ({
  Command: vi.fn(() => ({
    description: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
  })),
}));

// Import after mocks
import * as fs from "node:fs";
import { installDroid, uninstallDroid } from "./droid.js";

describe("droid installer", () => {
  let mockExistsSync: any;
  let mockReadFileSync: any;
  let mockWriteFileSync: any;
  let mockMkdirSync: any;
  let mockRmSync: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync = vi.mocked(fs.existsSync);
    mockReadFileSync = vi.mocked(fs.readFileSync);
    mockWriteFileSync = vi.mocked(fs.writeFileSync);
    mockMkdirSync = vi.mocked(fs.mkdirSync);
    mockRmSync = vi.mocked(fs.rmSync);

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Set env to avoid actual path resolution
    process.env.DROID_PLUGIN_ROOT = "/test/plugins/mgrep";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DROID_PLUGIN_ROOT;
  });

  describe("installDroid", () => {
    it("should install plugin successfully", async () => {
      // Mock factory directory exists
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks")) return false;
        if (String(path).includes("skills")) return false;
        if (String(path).includes("settings.json")) return false;
        return false;
      });

      mockReadFileSync.mockImplementation((path) => {
        if (String(path).includes("mgrep_watch.py"))
          return "watch hook content";
        if (String(path).includes("mgrep_watch_kill.py"))
          return "kill hook content";
        if (String(path).includes("SKILL.md")) return "skill content";
        if (String(path).includes("settings.json")) return "{}";
        return "";
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installDroid.parseAsync([]);

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Installed the mgrep hooks and skill for Factory Droid",
        ),
      );

      consoleSpy.mockRestore();
    });

    it("should handle missing factory directory", async () => {
      mockExistsSync.mockReturnValue(false);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      try {
        await installDroid.parseAsync([]);
      } catch (e) {
        // Expected
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Factory Droid directory not found"),
      );

      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it("should merge hooks with existing settings", async () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("settings.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path) => {
        if (String(path).includes("mgrep_watch.py")) return "watch hook";
        if (String(path).includes("mgrep_watch_kill.py")) return "kill hook";
        if (String(path).includes("SKILL.md")) return "skill";
        if (String(path).includes("settings.json")) {
          return JSON.stringify({
            hooks: {
              SessionStart: [
                {
                  matcher: "other",
                  hooks: [{ type: "command", command: "other", timeout: 10 }],
                },
              ],
            },
          });
        }
        return "";
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await installDroid.parseAsync([]);

      // Should merge, not replace
      const writeCalls = mockWriteFileSync.mock.calls;
      const settingsWrite = writeCalls.find((call) =>
        String(call[0]).includes("settings.json"),
      );

      if (settingsWrite) {
        const content = settingsWrite[1];
        expect(content).toContain("other");
        expect(content).toContain("mgrep");
      }

      consoleSpy.mockRestore();
    });
  });

  describe("uninstallDroid", () => {
    it("should uninstall plugin successfully", async () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks/mgrep")) return true;
        if (String(path).includes("skills/mgrep")) return true;
        if (String(path).includes("settings.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path) => {
        if (String(path).includes("settings.json")) {
          return JSON.stringify({
            hooks: {
              SessionStart: [
                {
                  matcher: "startup",
                  hooks: [
                    {
                      type: "command",
                      command: 'python3 "/test/hooks/mgrep/mgrep_watch.py"',
                      timeout: 10,
                    },
                  ],
                },
              ],
              SessionEnd: [
                {
                  hooks: [
                    {
                      type: "command",
                      command:
                        'python3 "/test/hooks/mgrep/mgrep_watch_kill.py"',
                      timeout: 10,
                    },
                  ],
                },
              ],
            },
          });
        }
        return "";
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallDroid.parseAsync([]);

      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining("hooks/mgrep"),
        expect.any(Object),
      );
      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining("skills/mgrep"),
        expect.any(Object),
      );
      expect(mockWriteFileSync).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle missing directories gracefully", async () => {
      mockExistsSync.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallDroid.parseAsync([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        "No mgrep hooks found for Factory Droid",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "No mgrep skill found for Factory Droid",
      );

      consoleSpy.mockRestore();
    });

    it("should handle settings file not found", async () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks/mgrep")) return true;
        if (String(path).includes("skills/mgrep")) return true;
        return false;
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await uninstallDroid.parseAsync([]);

      expect(mockRmSync).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle settings read errors", async () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks/mgrep")) return true;
        if (String(path).includes("skills/mgrep")) return true;
        if (String(path).includes("settings.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation(() => {
        throw new Error("Read error");
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await uninstallDroid.parseAsync([]);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to update Factory Droid settings during uninstall",
        ),
      );

      warnSpy.mockRestore();
    });
  });
});
