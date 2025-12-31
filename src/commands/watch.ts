import * as fs from "node:fs";
import * as path from "node:path";
import { Command, InvalidArgumentError } from "commander";
import {
  type CliConfigOptions,
  getConfigPaths,
  loadConfig,
  type MgrepConfig,
  reloadConfig,
} from "../lib/config.js";
import { createFileSystem, createStore } from "../lib/context.js";
import {
  createIndexingSpinner,
  formatDryRunSummary,
} from "../lib/sync-helpers.js";
import { deleteFile, initialSync, uploadFile } from "../lib/utils.js";

const CONFIG_RELOAD_DEBOUNCE_MS = 500;

export interface WatchOptions {
  store: string;
  dryRun: boolean;
  maxFileSize?: number;
}

export async function startWatch(options: WatchOptions): Promise<void> {
  try {
    const store = await createStore();

    const watchRoot = process.cwd();
    const cliOptions: CliConfigOptions = {
      maxFileSize: options.maxFileSize,
    };

    // Mutable config that can be reloaded
    let currentConfig: MgrepConfig = loadConfig(watchRoot, cliOptions);
    console.debug("Watching for file changes in", watchRoot);

    const fileSystem = createFileSystem({
      ignorePatterns: [],
      ignoreConfig: currentConfig.ignore,
    });

    const { spinner, onProgress } = createIndexingSpinner(watchRoot);
    try {
      try {
        await store.retrieve(options.store);
      } catch {
        await store.create({
          name: options.store,
          description:
            "mgrep store - Mixedbreads multimodal multilingual magic search",
        });
      }
      const result = await initialSync(
        store,
        fileSystem,
        options.store,
        watchRoot,
        options.dryRun,
        onProgress,
        currentConfig,
      );
      const deletedInfo =
        result.deleted > 0 ? ` • deleted ${result.deleted}` : "";
      const errorsInfo = result.errors > 0 ? ` • errors ${result.errors}` : "";
      if (result.errors > 0) {
        spinner.warn(
          `Initial sync complete (${result.processed}/${result.total}) • uploaded ${result.uploaded}${deletedInfo}${errorsInfo}`,
        );
        console.error(
          `\n⚠️  ${result.errors} file(s) failed to upload. Run with DEBUG=mgrep* for more details.`,
        );
      } else {
        spinner.succeed(
          `Initial sync complete (${result.processed}/${result.total}) • uploaded ${result.uploaded}${deletedInfo}`,
        );
      }
      if (options.dryRun) {
        console.log(
          formatDryRunSummary(result, {
            actionDescription: "found",
            includeTotal: true,
          }),
        );
        return;
      }
    } catch (e) {
      spinner.fail("Initial upload failed");
      throw e;
    }

    console.log("Watching for file changes in", watchRoot);
    fileSystem.loadMgrepignore(watchRoot);

    // Set up config file watchers for hot reload
    const configPaths = getConfigPaths(watchRoot);
    let configReloadTimeout: ReturnType<typeof setTimeout> | null = null;

    const reloadConfigDebounced = () => {
      if (configReloadTimeout) {
        clearTimeout(configReloadTimeout);
      }
      configReloadTimeout = setTimeout(() => {
        const newConfig = reloadConfig(watchRoot, cliOptions);
        if (newConfig) {
          currentConfig = newConfig;
          console.log("Configuration reloaded successfully");
        } else {
          console.warn("Config reload failed, keeping previous configuration");
        }
      }, CONFIG_RELOAD_DEBOUNCE_MS);
    };

    // Watch each config file path
    for (const configPath of configPaths) {
      const configDir = path.dirname(configPath);
      const configFile = path.basename(configPath);

      // Only watch if directory exists
      if (fs.existsSync(configDir)) {
        try {
          fs.watch(configDir, (_eventType, filename) => {
            if (filename === configFile) {
              console.debug(`Config file changed: ${configPath}`);
              reloadConfigDebounced();
            }
          });
        } catch {
          // Directory might not be watchable, ignore
        }
      }
    }

    // Watch for file changes in the project
    fs.watch(watchRoot, { recursive: true }, (eventType, rawFilename) => {
      const filename = rawFilename?.toString();
      if (!filename) {
        return;
      }
      const filePath = path.join(watchRoot, filename);

      // Check if this is a config file change
      if (configPaths.includes(filePath)) {
        console.debug(`Config file changed: ${filePath}`);
        reloadConfigDebounced();
        return;
      }

      if (fileSystem.isIgnored(filePath, watchRoot)) {
        return;
      }

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          return;
        }

        uploadFile(store, options.store, filePath, filename, currentConfig)
          .then((didUpload) => {
            if (didUpload) {
              console.log(`${eventType}: ${filePath}`);
            }
          })
          .catch((err) => {
            console.error("Failed to upload changed file:", filePath, err);
          });
      } catch {
        if (filePath.startsWith(watchRoot) && !fs.existsSync(filePath)) {
          deleteFile(store, options.store, filePath)
            .then(() => {
              console.log(`delete: ${filePath}`);
            })
            .catch((err) => {
              console.error("Failed to delete file:", filePath, err);
            });
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to start watcher:", message);
    process.exitCode = 1;
  }
}

export const watch = new Command("watch")
  .option(
    "-d, --dry-run",
    "Dry run the watch process (no actual file syncing)",
    false,
  )
  .option(
    "--max-file-size <bytes>",
    "Maximum file size in bytes to upload",
    (value) => {
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new InvalidArgumentError("Must be a positive integer.");
      }
      return parsed;
    },
  )
  .description("Watch for file changes")
  .action(async (_args, cmd) => {
    const options: WatchOptions = cmd.optsWithGlobals();
    await startWatch(options);
  });
