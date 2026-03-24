import { join, normalize } from "node:path";
import type { Command } from "commander";
import { Command as CommanderCommand, InvalidArgumentError } from "commander";
import type { CliConfigOptions } from "../lib/config.js";
import {
  formatAskResponse,
  formatSearchResponse,
} from "../lib/formatters/search-formatter.js";
import { FzfPipe, type SearchResultForFzf } from "../lib/fzf-pipe.js";
import { nativeSelect } from "../lib/native-select.js";
import {
  createSearchContext,
  syncFiles,
} from "../lib/search-command-helpers.js";
import type { FileMetadata, TextChunk } from "../lib/store.js";
import { WatcherManager } from "../lib/watcher-manager.js";

function parseBooleanEnv(
  envVar: string | undefined,
  defaultValue: boolean,
): boolean {
  if (envVar === undefined) return defaultValue;
  const lower = envVar.toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes" || lower === "y";
}

export const search: Command = new CommanderCommand("search")
  .description("File pattern searcher")
  .option("-i", "Makes the search case-insensitive", false)
  .option("-r", "Recursive search", false)
  .option(
    "-m, --max-count <max_count>",
    "The maximum number of results to return",
    process.env.MGREP_MAX_COUNT || "10",
  )
  .option(
    "-c, --content",
    "Show content of the results",
    parseBooleanEnv(process.env.MGREP_CONTENT, false),
  )
  .option(
    "-a, --answer",
    "Generate an answer to the question based on the results",
    parseBooleanEnv(process.env.MGREP_ANSWER, false),
  )
  .option(
    "-s, --sync",
    "Syncs the local files to the store before searching",
    parseBooleanEnv(process.env.MGREP_SYNC, false),
  )
  .option(
    "-d, --dry-run",
    "Dry run the search process (no actual file syncing)",
    parseBooleanEnv(process.env.MGREP_DRY_RUN, false),
  )
  .option(
    "--no-rerank",
    "Disable reranking of search results",
    parseBooleanEnv(process.env.MGREP_RERANK, true), // `true` here means that reranking is enabled by default
  )
  .option(
    "--fzf",
    "Pipe results through fzf for interactive selection",
    parseBooleanEnv(process.env.MGREP_FZF, false),
  )
  .option(
    "--auto-watch",
    "Auto-spawn background watcher after sync (default: true)",
    parseBooleanEnv(process.env.MGREP_AUTO_WATCH, true),
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
  .argument("<pattern>", "The pattern to search for")
  .argument("[path]", "The path to search in")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (pattern, exec_path, _options, cmd) => {
    const options: {
      store: string;
      maxCount: string;
      content: boolean;
      answer: boolean;
      sync: boolean;
      dryRun: boolean;
      rerank: boolean;
      fzf: boolean;
      autoWatch: boolean;
      maxFileSize?: number;
    } = cmd.optsWithGlobals();
    if (exec_path?.startsWith("--")) {
      exec_path = "";
    }

    const root = process.cwd();
    const cliOptions: CliConfigOptions = {
      maxFileSize: options.maxFileSize,
    };

    try {
      const { config, store, fileSystem } = await createSearchContext(
        root,
        cliOptions,
      );

      if (options.sync) {
        const shouldReturn = await syncFiles(
          store,
          fileSystem,
          options.store,
          root,
          options.dryRun,
          config,
        );
        if (shouldReturn) {
          return;
        }

        if (options.autoWatch && !options.dryRun) {
          const isRunning = await WatcherManager.isWatcherRunning(
            options.store,
          );
          if (!isRunning) {
            try {
              const pid = await WatcherManager.startWatcher(
                options.store,
                root,
              );
              console.error(`Background watcher started (PID: ${pid})`);
            } catch {}
          }
        }
      }

      const search_path = exec_path?.startsWith("/")
        ? exec_path
        : normalize(join(root, exec_path ?? ""));

      const storeIds = [options.store];

      const filters = {
        all: [
          {
            key: "path",
            operator: "starts_with" as const,
            value: search_path,
          },
        ],
      };

      const maxCount = parseInt(options.maxCount, 10);

      let response: string;
      if (!options.answer) {
        const results = await store.search(
          storeIds,
          pattern,
          maxCount,
          { rerank: options.rerank },
          filters,
        );

        if (options.fzf) {
          const fzfPipe = new FzfPipe();
          const fzfResults: SearchResultForFzf[] = results.data
            .filter((chunk): chunk is TextChunk => chunk.type === "text")
            .map((chunk) => ({
              path: (chunk.metadata as FileMetadata)?.path ?? "",
              startLine: (chunk.generated_metadata?.start_line ?? 0) + 1,
              endLine:
                (chunk.generated_metadata?.start_line ?? 0) +
                1 +
                (chunk.generated_metadata?.num_lines ?? 0),
              score: chunk.score,
              preview: chunk.text.slice(0, 200),
            }));

          const fzfAvailable = await FzfPipe.isAvailable();
          if (fzfAvailable) {
            const selected = await fzfPipe.selectWithFzf(fzfResults);
            if (selected?.selected) {
              await fzfPipe.openInEditor(
                selected.filePath,
                selected.lineNumber,
              );
            }
            return;
          }

          console.error(
            "fzf not found. Falling back to built-in selector (top 20 results).",
          );
          const selected = await nativeSelect(fzfResults, 20);
          if (selected?.selected) {
            await fzfPipe.openInEditor(selected.filePath, selected.lineNumber);
          }
          return;
        }

        if (results.data.length === 0) {
          try {
            const stats = await store.getStats(options.store);
            if (stats.chunk_count === 0) {
              console.log("No files indexed. Run 'mgrep sync' first.");
              return;
            }
          } catch {}
          console.log(`No matches found for "${pattern}".`);
          console.log("\nTry:");
          console.log("  - Broadening your search query");
          if (exec_path) {
            console.log("  - Removing path filters");
          }
          console.log("  - Running 'mgrep stats' to check indexed files");
          return;
        }

        response = formatSearchResponse(results, options.content);
      } else {
        const results = await store.ask(
          storeIds,
          pattern,
          maxCount,
          { rerank: options.rerank },
          filters,
        );

        response = formatAskResponse(results, options.content);
      }

      console.log(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to search: ${message}`);
      process.exitCode = 1;
    }
  });
