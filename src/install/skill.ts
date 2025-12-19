import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_RELATIVE_PATH = "plugins/mgrep/skills/mgrep/SKILL.md";

/**
 * Resolves the path to the canonical SKILL.md file.
 * Strategy:
 * 1. import.meta.url + relative path (development/ESM)
 * 2. __dirname + relative path (CommonJS fallback)
 * 3. dist/plugins path (bundled)
 */
function resolveSkillPath(): string {
  // Strategy 1: ESM with import.meta.url
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(currentFile), "../..");
    const skillPath = path.join(projectRoot, SKILL_RELATIVE_PATH);
    if (fs.existsSync(skillPath)) {
      return skillPath;
    }
  } catch {
    // import.meta.url not available
  }

  // Strategy 2: Try dist/plugins path (for bundled distribution)
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const distRoot = path.resolve(path.dirname(currentFile), "..");
    const skillPath = path.join(distRoot, SKILL_RELATIVE_PATH);
    if (fs.existsSync(skillPath)) {
      return skillPath;
    }
  } catch {
    // Fallback
  }

  // Strategy 3: Check relative to cwd (development)
  const cwdSkillPath = path.join(process.cwd(), SKILL_RELATIVE_PATH);
  if (fs.existsSync(cwdSkillPath)) {
    return cwdSkillPath;
  }

  throw new Error(
    `SKILL.md not found. Searched locations:\n` +
      `  - ${SKILL_RELATIVE_PATH} (relative to project root)\n` +
      `  - dist/${SKILL_RELATIVE_PATH} (bundled)\n` +
      `  - ${cwdSkillPath} (relative to cwd)`,
  );
}

/**
 * Loads the canonical SKILL.md content.
 * This is the single source of truth for the mgrep skill definition.
 *
 * @returns The content of SKILL.md as a string
 * @throws Error if SKILL.md cannot be found or read
 */
export function loadSkill(): string {
  const skillPath = resolveSkillPath();
  return fs.readFileSync(skillPath, "utf-8");
}

/**
 * Computes a SHA256 hash of the SKILL.md content.
 * Useful for detecting when the skill definition has changed
 * and needs to be reinstalled.
 *
 * @returns The SHA256 hash of the SKILL.md content
 */
export function getSkillVersion(): string {
  const content = loadSkill();
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Gets the short version (first 8 chars) of the skill hash.
 * Useful for display purposes.
 *
 * @returns Short hash string
 */
export function getSkillVersionShort(): string {
  return getSkillVersion().substring(0, 8);
}
