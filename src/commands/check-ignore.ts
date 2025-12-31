import * as path from "node:path";
import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { createFileSystem } from "../lib/context.js";

export const checkIgnoreCommand = new Command("check-ignore")
  .description("Check if a file would be ignored")
  .argument("<path>", "Path to check")
  .action(async (filePath) => {
    const root = process.cwd();
    const config = loadConfig(root);
    const fileSystem = createFileSystem({
      ignoreConfig: config.ignore,
      ignorePatterns: [],
    });

    const absolutePath = path.resolve(filePath);
    const ignored = fileSystem.isIgnored(absolutePath, root);

    if (ignored) {
      console.log(`${filePath} would be IGNORED`);
    } else {
      console.log(`${filePath} would NOT be ignored`);
    }
  });
