import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => {
  const mock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
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
    resolve: vi.fn((...args: string[]) => args.join("/")),
  };
  return { ...mock, default: mock };
});

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn(() => "/test/path.js"),
}));

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

    process.env.DROID_PLUGIN_ROOT = "/test/plugins/mgrep";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DROID_PLUGIN_ROOT;
  });

  describe("installDroid", () => {
    it("should install plugin successfully", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        const p = String(path);
        if (p.includes("dist/plugins/mgrep")) return true;
        if (p.includes("plugins/mgrep")) return true;
        if (p.endsWith(".factory")) return true;
        if (p.includes("hooks/mgrep")) return false;
        if (p.includes("skills/mgrep")) return false;
        if (p.includes("settings.json")) return false;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (String(path).includes("mgrep_watch.py"))
          return "watch hook content";
        if (String(path).includes("mgrep_watch_kill.py"))
          return "kill hook content";
        if (String(path).includes("SKILL.md")) return "skill content";
        if (String(path).includes("settings.json")) return "{}";
        return "";
      });

      await installDroid.parseAsync(["node", "test"]);

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Installed the mgrep hooks and skill for Factory Droid",
        ),
      );
    });

    it("should handle missing factory directory", async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(installDroid.parseAsync(["node", "test"])).rejects.toThrow(
        "Factory Droid directory not found",
      );
    });

    it("should merge hooks with existing settings", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        const p = String(path);
        if (p.includes("dist/plugins/mgrep")) return true;
        if (p.includes("plugins/mgrep")) return true;
        if (p.endsWith(".factory")) return true;
        if (p.includes("settings.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
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

      await installDroid.parseAsync(["node", "test"]);

      const writeCalls = mockWriteFileSync.mock.calls;
      const settingsWrite = writeCalls.find((call: any) =>
        String(call[0]).includes("settings.json"),
      );

      if (settingsWrite) {
        const content = settingsWrite[1];
        expect(content).toContain("other");
        expect(content).toContain("mgrep");
      }
    });
  });

  describe("uninstallDroid", () => {
    it("should uninstall plugin successfully", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks/mgrep")) return true;
        if (String(path).includes("skills/mgrep")) return true;
        if (String(path).includes("settings.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
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

      await uninstallDroid.parseAsync(["node", "test"]);

      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining("hooks/mgrep"),
        expect.any(Object),
      );
      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining("skills/mgrep"),
        expect.any(Object),
      );
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it("should handle missing directories gracefully", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (String(path).endsWith(".factory")) return true;
        return false;
      });

      await uninstallDroid.parseAsync(["node", "test"]);

      expect(console.log).toHaveBeenCalledWith(
        "No mgrep hooks found for Factory Droid",
      );
      expect(console.log).toHaveBeenCalledWith(
        "No mgrep skill found for Factory Droid",
      );
    });

    it("should handle settings file not found", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks/mgrep")) return true;
        if (String(path).includes("skills/mgrep")) return true;
        return false;
      });

      await uninstallDroid.parseAsync(["node", "test"]);

      expect(mockRmSync).toHaveBeenCalled();
    });

    it("should handle settings read errors", async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (String(path).includes(".factory")) return true;
        if (String(path).includes("hooks/mgrep")) return true;
        if (String(path).includes("skills/mgrep")) return true;
        if (String(path).includes("settings.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation(() => {
        throw new Error("Read error");
      });

      await uninstallDroid.parseAsync(["node", "test"]);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to update Factory Droid settings during uninstall",
        ),
      );
    });
  });
});
