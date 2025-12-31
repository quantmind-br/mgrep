import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { getCategoryInfo } from "../lib/ignore-patterns.js";

export const configCommand = new Command("config")
  .description("Manage configuration")
  .option("--show-ignore", "Show active ignore patterns")
  .action(async (options) => {
    if (options.showIgnore) {
      const config = loadConfig(process.cwd());
      const { ignore } = config;

      console.log("Active Ignore Patterns:\n");

      console.log("Categories:");
      const categories = getCategoryInfo();
      let total = 0;

      for (const cat of categories) {
        // Check if enabled in config (config overrides default)
        const isEnabled = ignore.categories[cat.name];
        const status = isEnabled ? "✓" : "✗";
        const statusText = isEnabled ? "(enabled)" : "(disabled)";
        console.log(
          `  ${status} ${cat.name} ${statusText} - ${cat.patternCount} patterns`,
        );
        if (isEnabled) {
          total += cat.patternCount;
        }
      }

      console.log(`\nAdditional patterns: ${ignore.additional.length}`);
      ignore.additional.forEach((p) => {
        console.log(`  - ${p}`);
      });
      total += ignore.additional.length;

      console.log(`\nExceptions: ${ignore.exceptions.length}`);
      ignore.exceptions.forEach((p) => {
        console.log(`  - ${p}`);
      });
      // Exceptions don't increase count of ignored patterns, they un-ignore.

      console.log(`\nTotal active patterns: ${total}`);
    }
  });
