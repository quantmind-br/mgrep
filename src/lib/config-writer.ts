/**
 * Config Writer Module
 *
 * Provides utilities for reading, writing, and managing mgrep configuration files.
 * Supports both global (~/.config/mgrep/config.yaml) and local (.mgreprc.yaml) configs.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import {
  ConfigSchema,
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_FILES,
  LOCAL_CONFIG_FILES,
  type MgrepConfig,
} from "./config.js";

export type ConfigTarget = "global" | "local";

export interface ConfigLocation {
  target: ConfigTarget;
  path: string;
  exists: boolean;
}

/**
 * Get the path to the global config file.
 * Returns the first existing file, or the default path if none exist.
 */
export function getGlobalConfigPath(): string {
  const configDir = path.join(os.homedir(), GLOBAL_CONFIG_DIR);
  for (const file of GLOBAL_CONFIG_FILES) {
    const filePath = path.join(configDir, file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return path.join(configDir, GLOBAL_CONFIG_FILES[0]);
}

/**
 * Get the path to the local config file for a given directory.
 * Returns the first existing file, or the default path if none exist.
 */
export function getLocalConfigPath(dir: string): string {
  const absoluteDir = path.resolve(dir);
  for (const file of LOCAL_CONFIG_FILES) {
    const filePath = path.join(absoluteDir, file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return path.join(absoluteDir, LOCAL_CONFIG_FILES[0]);
}

/**
 * Get information about config file locations.
 */
export function getConfigLocations(dir: string): {
  global: ConfigLocation;
  local: ConfigLocation;
} {
  const globalPath = getGlobalConfigPath();
  const localPath = getLocalConfigPath(dir);

  return {
    global: {
      target: "global",
      path: globalPath,
      exists: fs.existsSync(globalPath),
    },
    local: {
      target: "local",
      path: localPath,
      exists: fs.existsSync(localPath),
    },
  };
}

/**
 * Read a config file and return the parsed config.
 * Returns null if the file doesn't exist.
 * Throws if the file exists but is invalid.
 */
export function readConfigFile(filePath: string): Partial<MgrepConfig> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.trim()) {
    return {};
  }

  const parsed = YAML.parse(content);
  if (parsed === null || parsed === undefined) {
    return {};
  }

  const validated = ConfigSchema.partial().parse(parsed);
  return validated as Partial<MgrepConfig>;
}

/**
 * Read the raw YAML content of a config file.
 * Returns null if the file doesn't exist.
 */
export function readConfigFileRaw(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Write a config to a file.
 * Creates the parent directory if it doesn't exist.
 */
export function writeConfigFile(
  filePath: string,
  config: Partial<MgrepConfig>,
  options: { header?: string } = {},
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const header =
    options.header ??
    "# mgrep configuration\n# See: https://github.com/anomalyco/mgrep\n\n";
  const yamlBody = YAML.stringify(config, {
    indent: 2,
    lineWidth: 0,
  });

  fs.writeFileSync(filePath, `${header}${yamlBody}`, "utf-8");
}

/**
 * Update specific fields in a config file.
 * Preserves existing fields and only updates the specified ones.
 * Creates the file if it doesn't exist.
 */
export function updateConfigFile(
  filePath: string,
  updates: Partial<MgrepConfig>,
): void {
  const existing = readConfigFile(filePath) ?? {};
  const merged = deepMergePartialConfig(existing, updates);
  writeConfigFile(filePath, merged);
}

/**
 * Deep merge two partial configs.
 * The second config takes precedence over the first.
 */
export function deepMergePartialConfig(
  base: Partial<MgrepConfig>,
  override: Partial<MgrepConfig>,
): Partial<MgrepConfig> {
  const result: Partial<MgrepConfig> = { ...base };

  if (override.maxFileSize !== undefined) {
    result.maxFileSize = override.maxFileSize;
  }

  if (override.qdrant) {
    result.qdrant = { ...result.qdrant, ...override.qdrant };
  }

  if (override.embeddings) {
    result.embeddings = { ...result.embeddings, ...override.embeddings };
  }

  if (override.llm) {
    result.llm = { ...result.llm, ...override.llm };
  }

  if (override.sync) {
    result.sync = { ...result.sync, ...override.sync };
  }

  if (override.tavily) {
    result.tavily = { ...result.tavily, ...override.tavily };
  }

  if (override.ignore) {
    result.ignore = {
      ...result.ignore,
      ...override.ignore,
      categories: {
        ...result.ignore?.categories,
        ...override.ignore?.categories,
      },
      additional: override.ignore?.additional ?? result.ignore?.additional,
      exceptions: override.ignore?.exceptions ?? result.ignore?.exceptions,
    };
  }

  return result;
}

/**
 * Delete a config file.
 * Returns true if the file was deleted, false if it didn't exist.
 */
export function deleteConfigFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  fs.unlinkSync(filePath);
  return true;
}

/**
 * Check if a config file exists.
 */
export function configFileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Get the config file path based on target type.
 */
export function getConfigPath(target: ConfigTarget, dir: string): string {
  return target === "global" ? getGlobalConfigPath() : getLocalConfigPath(dir);
}
