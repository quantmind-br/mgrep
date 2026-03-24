import {
  type CliConfigOptions,
  loadConfig,
  type MgrepConfig,
} from "./config.js";
import {
  createCommandContext,
  createFileSystem,
  createStore,
} from "./context.js";
import type { FileSystem } from "./file.js";
import type { Store } from "./store.js";
import { createIndexingSpinner, formatDryRunSummary } from "./sync-helpers.js";
import { initialSync } from "./utils.js";

export async function syncFiles(
  store: Store,
  fileSystem: FileSystem,
  storeName: string,
  root: string,
  dryRun: boolean,
  config?: MgrepConfig,
): Promise<boolean> {
  const { spinner, onProgress } = createIndexingSpinner(root);

  try {
    const result = await initialSync(
      store,
      fileSystem,
      storeName,
      root,
      dryRun,
      onProgress,
      config,
    );

    while (true) {
      const info = await store.getInfo(storeName);
      spinner.text = `Indexing ${info.counts.pending + info.counts.in_progress} file(s)`;
      if (info.counts.pending === 0 && info.counts.in_progress === 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    spinner.succeed("Indexing complete");

    if (dryRun) {
      console.log(
        formatDryRunSummary(result, {
          actionDescription: "would have indexed",
        }),
      );
      return true;
    }

    return false;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

export async function createSearchContext(
  root: string,
  cliOptions: CliConfigOptions,
): Promise<{
  root: string;
  config: MgrepConfig;
  store: Store;
  fileSystem: FileSystem;
}> {
  try {
    return await createCommandContext(root, cliOptions);
  } catch {
    const config = loadConfig(root, cliOptions);
    const store = await createStore();
    const fileSystem = createFileSystem({
      ignoreConfig: config.ignore,
      ignorePatterns: [],
    });
    return { root, config, store, fileSystem };
  }
}
