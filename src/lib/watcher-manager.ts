import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PidFileData {
  pid: number;
  startTime: number;
  storeId: string;
  workingDir: string;
}

export interface WatcherStatus {
  running: boolean;
  pid?: number;
  storeId?: string;
  workingDir?: string;
  uptime?: number;
}

export class WatcherManager {
  private static readonly MGREP_DIR = ".mgrep";

  static getMgrepDir(): string {
    return join(homedir(), WatcherManager.MGREP_DIR);
  }

  static getPidFilePath(storeId: string): string {
    return join(WatcherManager.getMgrepDir(), `watcher-${storeId}.pid`);
  }

  static async ensureMgrepDir(): Promise<void> {
    const dir = WatcherManager.getMgrepDir();
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  static async writePidFile(storeId: string, data: PidFileData): Promise<void> {
    await WatcherManager.ensureMgrepDir();
    const pidPath = WatcherManager.getPidFilePath(storeId);
    await fs.writeFile(pidPath, JSON.stringify(data, null, 2));
  }

  static async readPidFile(storeId: string): Promise<PidFileData | null> {
    const pidPath = WatcherManager.getPidFilePath(storeId);
    try {
      const content = await fs.readFile(pidPath, "utf-8");
      return JSON.parse(content) as PidFileData;
    } catch {
      return null;
    }
  }

  static async cleanupStalePidFile(storeId: string): Promise<void> {
    const pidPath = WatcherManager.getPidFilePath(storeId);
    try {
      await fs.unlink(pidPath);
    } catch {}
  }

  static isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static async isWatcherRunning(storeId: string): Promise<boolean> {
    const pidData = await WatcherManager.readPidFile(storeId);
    if (!pidData) {
      return false;
    }

    if (!WatcherManager.isProcessRunning(pidData.pid)) {
      await WatcherManager.cleanupStalePidFile(storeId);
      return false;
    }

    return true;
  }

  static async startWatcher(
    storeId: string,
    workingDir: string,
    mgrepPath?: string,
  ): Promise<number> {
    await WatcherManager.ensureMgrepDir();

    const cmd = mgrepPath ?? process.argv[1];
    const args = ["watch", "--store", storeId];

    const child = spawn(cmd, args, {
      cwd: workingDir,
      detached: true,
      stdio: "ignore",
    });

    child.unref();

    const pid = child.pid;
    if (!pid) {
      throw new Error("Failed to spawn watcher process");
    }

    const pidData: PidFileData = {
      pid,
      startTime: Date.now(),
      storeId,
      workingDir,
    };

    await WatcherManager.writePidFile(storeId, pidData);

    return pid;
  }

  static async stopWatcher(storeId: string): Promise<boolean> {
    const pidData = await WatcherManager.readPidFile(storeId);
    if (!pidData) {
      return false;
    }

    if (!WatcherManager.isProcessRunning(pidData.pid)) {
      await WatcherManager.cleanupStalePidFile(storeId);
      return false;
    }

    try {
      process.kill(pidData.pid, "SIGTERM");

      let attempts = 0;
      while (attempts < 10 && WatcherManager.isProcessRunning(pidData.pid)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      if (WatcherManager.isProcessRunning(pidData.pid)) {
        process.kill(pidData.pid, "SIGKILL");
      }
    } catch {}

    await WatcherManager.cleanupStalePidFile(storeId);
    return true;
  }

  static async getWatcherStatus(storeId: string): Promise<WatcherStatus> {
    const pidData = await WatcherManager.readPidFile(storeId);

    if (!pidData) {
      return { running: false };
    }

    if (!WatcherManager.isProcessRunning(pidData.pid)) {
      await WatcherManager.cleanupStalePidFile(storeId);
      return { running: false };
    }

    const uptime = Date.now() - pidData.startTime;

    return {
      running: true,
      pid: pidData.pid,
      storeId: pidData.storeId,
      workingDir: pidData.workingDir,
      uptime,
    };
  }

  static formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}
