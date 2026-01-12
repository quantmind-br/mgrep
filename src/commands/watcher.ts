import chalk from "chalk";
import { Command } from "commander";
import { WatcherManager } from "../lib/watcher-manager.js";

const start = new Command("start")
  .description("Start background watcher for the current directory")
  .action(async (_args, cmd) => {
    const options: { store: string } = cmd.optsWithGlobals();
    const storeId = options.store;
    const workingDir = process.cwd();

    try {
      const isRunning = await WatcherManager.isWatcherRunning(storeId);
      if (isRunning) {
        const status = await WatcherManager.getWatcherStatus(storeId);
        console.log(
          chalk.yellow(
            `Watcher already running for store "${storeId}" (PID: ${status.pid})`,
          ),
        );
        return;
      }

      const pid = await WatcherManager.startWatcher(storeId, workingDir);
      console.log(
        chalk.green(
          `Started background watcher for store "${storeId}" (PID: ${pid})`,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(chalk.red(`Failed to start watcher: ${message}`));
      process.exitCode = 1;
    }
  });

const stop = new Command("stop")
  .description("Stop background watcher")
  .action(async (_args, cmd) => {
    const options: { store: string } = cmd.optsWithGlobals();
    const storeId = options.store;

    try {
      const stopped = await WatcherManager.stopWatcher(storeId);
      if (stopped) {
        console.log(chalk.green(`Stopped watcher for store "${storeId}"`));
      } else {
        console.log(
          chalk.yellow(`No running watcher found for store "${storeId}"`),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(chalk.red(`Failed to stop watcher: ${message}`));
      process.exitCode = 1;
    }
  });

const status = new Command("status")
  .description("Show watcher status")
  .action(async (_args, cmd) => {
    const options: { store: string } = cmd.optsWithGlobals();
    const storeId = options.store;

    try {
      const watcherStatus = await WatcherManager.getWatcherStatus(storeId);

      if (watcherStatus.running) {
        const uptime = WatcherManager.formatUptime(watcherStatus.uptime ?? 0);
        console.log(chalk.green("● Watcher is running"));
        console.log(`  Store:     ${storeId}`);
        console.log(`  PID:       ${watcherStatus.pid}`);
        console.log(`  Directory: ${watcherStatus.workingDir}`);
        console.log(`  Uptime:    ${uptime}`);
      } else {
        console.log(chalk.gray(`○ Watcher not running for store "${storeId}"`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(chalk.red(`Failed to get status: ${message}`));
      process.exitCode = 1;
    }
  });

export const watcher = new Command("watcher")
  .description("Manage background file watcher")
  .addCommand(start)
  .addCommand(stop)
  .addCommand(status);
