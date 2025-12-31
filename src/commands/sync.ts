import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { createFileSystem, createStore } from "../lib/context.js";
import {
  createIndexingSpinner,
  formatDryRunSummary,
} from "../lib/sync-helpers.js";
import { initialSync } from "../lib/utils.js";

export const syncCommand = new Command("sync")
  .description("Synchronize local files with the store")
  .option("-d, --dry-run", "Dry run", false)
  .option("--store <string>", "Store name", "mgrep")
  .option("--include-vendor", "Include vendor files (don't ignore)", false)
  .option(
    "--include-generated",
    "Include generated files (don't ignore)",
    false,
  )
  .option(
    "--include-all",
    "Include all files (disable all ignore categories)",
    false,
  )
  // .option("--show-ignored", "Show ignored files (only with --dry-run)", false) // TODO: Implement breakdown
  .action(async (options) => {
    const root = process.cwd();
    const config = loadConfig(root);

    // Apply CLI overrides
    if (options.includeAll) {
      config.ignore.categories = {
        vendor: false,
        generated: false,
        binary: false,
        config: false,
      };
    } else {
      if (options.includeVendor) config.ignore.categories.vendor = false;
      if (options.includeGenerated) config.ignore.categories.generated = false;
    }

    try {
      const store = await createStore();
      // Ensure store exists
      try {
        await store.retrieve(options.store);
      } catch {
        await store.create({
          name: options.store,
          description: "mgrep store",
        });
      }

      const fileSystem = createFileSystem({
        ignoreConfig: config.ignore,
        ignorePatterns: [],
      });

      const { spinner, onProgress } = createIndexingSpinner(root);

      try {
        const result = await initialSync(
          store,
          fileSystem,
          options.store,
          root,
          options.dryRun,
          onProgress,
          config,
        );

        spinner.succeed("Sync complete");

        if (options.dryRun) {
          console.log(
            formatDryRunSummary(result, {
              actionDescription: "would have synced",
            }),
          );
        }
      } catch (e) {
        spinner.fail("Sync failed");
        throw e;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to sync: ${message}`);
      process.exit(1);
    }
  });
