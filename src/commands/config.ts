import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { type ConfigTarget, getConfigLocations } from "../lib/config-writer.js";
import { runConfigTUI } from "../lib/config-tui.js";
import { getCategoryInfo } from "../lib/ignore-patterns.js";

export const configCommand = new Command("config")
  .description("Manage configuration interactively")
  .option(
    "-g, --global",
    "Edit global configuration (~/.config/mgrep/config.yaml)",
  )
  .option("-l, --local", "Edit local configuration (.mgreprc.yaml)")
  .option("--show-ignore", "Show active ignore patterns")
  .option("--show", "Show current configuration paths and status")
  .action(async (options) => {
    const cwd = process.cwd();

    if (options.showIgnore) {
      showIgnorePatterns(cwd);
      return;
    }

    if (options.show) {
      showConfigStatus(cwd);
      return;
    }

    let target: ConfigTarget | undefined;
    if (options.global && options.local) {
      console.error("Error: Cannot specify both --global and --local");
      process.exitCode = 1;
      return;
    }

    if (options.global) {
      target = "global";
    } else if (options.local) {
      target = "local";
    }

    try {
      await runConfigTUI(cwd, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Configuration error: ${message}`);
      process.exitCode = 1;
    }
  });

function showIgnorePatterns(cwd: string): void {
  const config = loadConfig(cwd);
  const { ignore } = config;

  console.log("Active Ignore Patterns:\n");

  console.log("Categories:");
  const categories = getCategoryInfo();
  let total = 0;

  for (const cat of categories) {
    const isEnabled = ignore.categories[cat.name];
    const status = isEnabled ? "\u2713" : "\u2717";
    const statusText = isEnabled ? "(enabled)" : "(disabled)";
    console.log(
      `  ${status} ${cat.name} ${statusText} - ${cat.patternCount} patterns`,
    );
    if (isEnabled) {
      total += cat.patternCount;
    }
  }

  console.log(`\nAdditional patterns: ${ignore.additional.length}`);
  for (const p of ignore.additional) {
    console.log(`  - ${p}`);
  }
  total += ignore.additional.length;

  console.log(`\nExceptions: ${ignore.exceptions.length}`);
  for (const p of ignore.exceptions) {
    console.log(`  - ${p}`);
  }

  console.log(`\nTotal active patterns: ${total}`);
}

function showConfigStatus(cwd: string): void {
  const locations = getConfigLocations(cwd);

  console.log("Configuration Files:\n");

  console.log("Global:");
  console.log(`  Path: ${locations.global.path}`);
  console.log(`  Status: ${locations.global.exists ? "exists" : "not found"}`);

  console.log("\nLocal:");
  console.log(`  Path: ${locations.local.path}`);
  console.log(`  Status: ${locations.local.exists ? "exists" : "not found"}`);

  console.log("\nPrecedence (highest to lowest):");
  console.log("  1. CLI flags");
  console.log("  2. Environment variables (MGREP_*)");
  console.log("  3. Local config (.mgreprc.yaml)");
  console.log("  4. Global config (~/.config/mgrep/config.yaml)");
  console.log("  5. Default values");
}
