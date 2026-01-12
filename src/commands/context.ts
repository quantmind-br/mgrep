import { join, normalize } from "node:path";
import { Command as CommanderCommand } from "commander";
import type { Command } from "commander";
import { copyToClipboard } from "../lib/clipboard.js";
import {
  type CliConfigOptions,
  loadConfig,
  type MgrepConfig,
} from "../lib/config.js";
import { createFileSystem, createStore } from "../lib/context.js";
import {
  ContextFormatter,
  type ContextFormat,
} from "../lib/formatters/index.js";
import type { Store } from "../lib/store.js";
import { createIndexingSpinner } from "../lib/sync-helpers.js";
import { initialSync } from "../lib/utils.js";

interface ContextOptions {
  store: string;
  format: ContextFormat;
  maxTokens?: number;
  maxResults: number;
  path?: string;
  clipboard: boolean;
  sync: boolean;
  dryRun: boolean;
  rerank: boolean;
}

async function syncFiles(
  store: Store,
  storeName: string,
  root: string,
  dryRun: boolean,
  config?: MgrepConfig,
): Promise<void> {
  const { spinner, onProgress } = createIndexingSpinner(root);

  try {
    const fileSystem = createFileSystem({
      ignorePatterns: [],
      ignoreConfig: config?.ignore,
    });
    await initialSync(
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
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

export const context: Command = new CommanderCommand("context")
  .description("Export search results as LLM-optimized context")
  .argument("<query>", "Semantic search query")
  .argument("[path]", "Filter to specific path")
  .option("-f, --format <format>", "Output format: xml, markdown, plain", "xml")
  .option("-t, --max-tokens <n>", "Maximum tokens in output", Number.parseInt)
  .option(
    "-n, --max-results <n>",
    "Maximum results to include",
    Number.parseInt,
    10,
  )
  .option("-c, --clipboard", "Copy to clipboard instead of stdout", false)
  .option("-s, --sync", "Sync local files before searching", false)
  .option("-d, --dry-run", "Dry run (with --sync)", false)
  .option("--no-rerank", "Disable reranking of results", true)
  .action(
    async (
      query: string,
      execPath: string | undefined,
      _options: ContextOptions,
      cmd,
    ) => {
      const opts: ContextOptions = cmd.optsWithGlobals();

      if (execPath?.startsWith("--")) {
        execPath = undefined;
      }

      const root = process.cwd();
      const cliOptions: CliConfigOptions = {};
      const config = loadConfig(root, cliOptions);

      try {
        const store = await createStore();

        if (opts.sync) {
          await syncFiles(store, opts.store, root, opts.dryRun, config);
        }

        const searchPath = execPath?.startsWith("/")
          ? execPath
          : normalize(join(root, execPath ?? ""));

        const filters = {
          all: [
            {
              key: "path",
              operator: "starts_with" as const,
              value: searchPath,
            },
          ],
        };

        const results = await store.search(
          [opts.store],
          query,
          opts.maxResults,
          { rerank: opts.rerank },
          filters,
        );

        if (results.data.length === 0) {
          console.error("No matching code found for query");
          process.exitCode = 1;
          return;
        }

        const formatter = new ContextFormatter({
          format: opts.format,
          maxTokens: opts.maxTokens,
          query,
        });

        const formatted = formatter.formatResults(results.data);

        if (opts.clipboard) {
          const result = await copyToClipboard(formatted.content);
          if (result.success) {
            console.error(
              `Copied to clipboard: ${formatted.fileCount} file(s), ~${formatted.tokenEstimate} tokens${formatted.truncated ? " (truncated)" : ""}`,
            );
          } else {
            console.error(`Clipboard failed: ${result.error}`);
            console.log(formatted.content);
          }
        } else {
          console.log(formatted.content);

          const summary = [
            `Exported ${formatted.fileCount} file(s)`,
            `~${formatted.tokenEstimate} tokens`,
          ];
          if (formatted.truncated) {
            summary.push("(truncated)");
          }
          console.error(summary.join(" | "));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to export context: ${message}`);
        process.exitCode = 1;
      }
    },
  );
