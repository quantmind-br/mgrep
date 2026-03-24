import * as path from "node:path";
import { Command } from "commander";
import { createLightContext } from "../lib/context.js";

export const checkIgnoreCommand = new Command("check-ignore")
  .description("Check if a file would be ignored")
  .argument("<path>", "Path to check")
  .action(async (filePath) => {
    const { root, fileSystem } = createLightContext();

    const absolutePath = path.resolve(filePath);
    const ignored = fileSystem.isIgnored(absolutePath, root);

    if (ignored) {
      console.log(`${filePath} would be IGNORED`);
    } else {
      console.log(`${filePath} would NOT be ignored`);
    }
  });
