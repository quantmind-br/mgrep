import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type PidFileData, WatcherManager } from "./watcher-manager.js";

vi.mock("node:fs/promises");
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/testuser"),
}));

describe("WatcherManager", () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMgrepDir()", () => {
    it("returns path in home directory", () => {
      const dir = WatcherManager.getMgrepDir();
      expect(dir).toBe("/home/testuser/.mgrep");
    });
  });

  describe("getPidFilePath()", () => {
    it("returns correct pidfile path for store", () => {
      const path = WatcherManager.getPidFilePath("mystore");
      expect(path).toBe("/home/testuser/.mgrep/watcher-mystore.pid");
    });

    it("handles different store IDs", () => {
      expect(WatcherManager.getPidFilePath("default")).toContain(
        "watcher-default.pid",
      );
      expect(WatcherManager.getPidFilePath("test")).toContain(
        "watcher-test.pid",
      );
    });
  });

  describe("ensureMgrepDir()", () => {
    it("creates directory if missing", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await WatcherManager.ensureMgrepDir();

      expect(mockFs.mkdir).toHaveBeenCalledWith("/home/testuser/.mgrep", {
        recursive: true,
      });
    });

    it("ignores EEXIST error", async () => {
      const error = new Error("EEXIST") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      mockFs.mkdir.mockRejectedValue(error);

      await expect(WatcherManager.ensureMgrepDir()).resolves.not.toThrow();
    });

    it("throws on other errors", async () => {
      const error = new Error("EPERM") as NodeJS.ErrnoException;
      error.code = "EPERM";
      mockFs.mkdir.mockRejectedValue(error);

      await expect(WatcherManager.ensureMgrepDir()).rejects.toThrow();
    });
  });

  describe("writePidFile()", () => {
    it("creates valid JSON pidfile", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const data: PidFileData = {
        pid: 12345,
        startTime: Date.now(),
        storeId: "test",
        workingDir: "/project",
      };

      await WatcherManager.writePidFile("test", data);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("watcher-test.pid"),
        expect.stringContaining('"pid": 12345'),
      );
    });
  });

  describe("readPidFile()", () => {
    it("parses valid JSON pidfile", async () => {
      const data: PidFileData = {
        pid: 12345,
        startTime: 1000000,
        storeId: "test",
        workingDir: "/project",
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const result = await WatcherManager.readPidFile("test");

      expect(result).toEqual(data);
    });

    it("returns null for missing file", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const result = await WatcherManager.readPidFile("test");

      expect(result).toBeNull();
    });

    it("returns null for corrupted file", async () => {
      mockFs.readFile.mockResolvedValue("invalid json {{{");

      const result = await WatcherManager.readPidFile("test");

      expect(result).toBeNull();
    });
  });

  describe("cleanupStalePidFile()", () => {
    it("removes pidfile", async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await WatcherManager.cleanupStalePidFile("test");

      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining("watcher-test.pid"),
      );
    });

    it("ignores errors when file does not exist", async () => {
      mockFs.unlink.mockRejectedValue(new Error("ENOENT"));

      await expect(
        WatcherManager.cleanupStalePidFile("test"),
      ).resolves.not.toThrow();
    });
  });

  describe("isProcessRunning()", () => {
    it("returns true for running process", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      expect(WatcherManager.isProcessRunning(process.pid)).toBe(true);

      killSpy.mockRestore();
    });

    it("returns false for dead process", () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH");
      });

      expect(WatcherManager.isProcessRunning(999999)).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe("getWatcherStatus()", () => {
    it("returns running=false when no pidfile", async () => {
      mockFs.readFile.mockRejectedValue(new Error("ENOENT"));

      const status = await WatcherManager.getWatcherStatus("test");

      expect(status.running).toBe(false);
    });

    it("returns status with uptime when running", async () => {
      const startTime = Date.now() - 60000;
      const data: PidFileData = {
        pid: process.pid,
        startTime,
        storeId: "test",
        workingDir: "/project",
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));
      vi.spyOn(process, "kill").mockImplementation(() => true);

      const status = await WatcherManager.getWatcherStatus("test");

      expect(status.running).toBe(true);
      expect(status.pid).toBe(process.pid);
      expect(status.uptime).toBeGreaterThanOrEqual(60000);
    });
  });

  describe("formatUptime()", () => {
    it("formats seconds", () => {
      expect(WatcherManager.formatUptime(30000)).toBe("30s");
    });

    it("formats minutes and seconds", () => {
      expect(WatcherManager.formatUptime(90000)).toBe("1m 30s");
    });

    it("formats hours and minutes", () => {
      expect(WatcherManager.formatUptime(3700000)).toBe("1h 1m");
    });

    it("formats days and hours", () => {
      expect(WatcherManager.formatUptime(90000000)).toBe("1d 1h");
    });
  });
});
