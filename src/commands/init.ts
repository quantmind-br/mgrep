import { Command } from "commander";

export const initCommand = new Command("init")
  .description("Initialize mgrep configuration interactively")
  .option("--reconfigure", "Overwrite existing configuration", false)
  .action(async (_options) => {
    // TODO: Implement interactive init flow.
  });
