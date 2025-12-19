import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Command } from "commander";
import { getSkillVersionShort, loadSkill } from "./skill.js";

const shell =
  process.env.SHELL ||
  (process.platform === "win32" ? process.env.COMSPEC || "cmd.exe" : "/bin/sh");

const execAsync = promisify(exec);

async function installPlugin() {
  try {
    await execAsync("codex mcp add mgrep mgrep mcp", {
      shell,
      env: process.env,
    });
    console.log("Successfully installed the mgrep background sync");

    const destPath = path.join(os.homedir(), ".codex", "AGENTS.md");
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    let existingContent = "";
    if (fs.existsSync(destPath)) {
      existingContent = fs.readFileSync(destPath, "utf-8");
    }

    const skill = loadSkill();
    const skillTrimmed = skill.trim();
    const skillMarker = "name: mgrep";

    if (!existingContent.includes(skillMarker)) {
      fs.appendFileSync(destPath, `\n${skillTrimmed}\n`);
      console.log(
        `Successfully added mgrep skill to Codex agent (version: ${getSkillVersionShort()})`,
      );
    } else {
      console.log("The mgrep skill is already installed in the Codex agent");
    }
  } catch (error) {
    console.error(`Error installing plugin: ${error}`);
    process.exit(1);
  }
}

async function uninstallPlugin() {
  try {
    await execAsync("codex mcp remove mgrep", { shell, env: process.env });
  } catch (error) {
    console.error(`Error uninstalling plugin: ${error}`);
    process.exit(1);
  }

  const destPath = path.join(os.homedir(), ".codex", "AGENTS.md");
  if (fs.existsSync(destPath)) {
    const existingContent = fs.readFileSync(destPath, "utf-8");
    // Remove mgrep skill section (from "---\nname: mgrep" to next "---" section or EOF)
    const skillPattern =
      /\n?---\s*\nname:\s*mgrep[\s\S]*?(?=\n---\s*\nname:|$)/g;
    const updatedContent = existingContent.replace(skillPattern, "");

    if (updatedContent.trim() === "") {
      fs.unlinkSync(destPath);
    } else {
      fs.writeFileSync(destPath, updatedContent);
    }
  }
  console.log("Successfully removed the mgrep from the Codex agent");
}

export const installCodex = new Command("install-codex")
  .description("Install the Codex agent")
  .action(async () => {
    await installPlugin();
  });

export const uninstallCodex = new Command("uninstall-codex")
  .description("Uninstall the Codex agent")
  .action(async () => {
    await uninstallPlugin();
  });
