import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockHomeDir: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockHomeDir || actual.homedir(),
  };
});

import {
  configFileExists,
  deepMergePartialConfig,
  deleteConfigFile,
  getConfigLocations,
  getConfigPath,
  getGlobalConfigPath,
  getLocalConfigPath,
  readConfigFile,
  readConfigFileRaw,
  updateConfigFile,
  writeConfigFile,
} from "./config-writer.js";

describe("config-writer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrep-writer-test-"));
    mockHomeDir = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getGlobalConfigPath", () => {
    it("returns default path when no config exists", () => {
      const result = getGlobalConfigPath();
      expect(result).toBe(path.join(tempDir, ".config/mgrep/config.yaml"));
    });

    it("returns existing .yaml file path", () => {
      const configDir = path.join(tempDir, ".config/mgrep");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.yaml"), "maxFileSize: 100");

      const result = getGlobalConfigPath();
      expect(result).toBe(path.join(configDir, "config.yaml"));
    });

    it("returns existing .yml file path when .yaml does not exist", () => {
      const configDir = path.join(tempDir, ".config/mgrep");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.yml"), "maxFileSize: 100");

      const result = getGlobalConfigPath();
      expect(result).toBe(path.join(configDir, "config.yml"));
    });

    it("prefers .yaml over .yml when both exist", () => {
      const configDir = path.join(tempDir, ".config/mgrep");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.yaml"), "maxFileSize: 100");
      fs.writeFileSync(path.join(configDir, "config.yml"), "maxFileSize: 200");

      const result = getGlobalConfigPath();
      expect(result).toBe(path.join(configDir, "config.yaml"));
    });
  });

  describe("getLocalConfigPath", () => {
    it("returns default path when no config exists", () => {
      const result = getLocalConfigPath(tempDir);
      expect(result).toBe(path.join(tempDir, ".mgreprc.yaml"));
    });

    it("returns existing .yaml file path", () => {
      fs.writeFileSync(path.join(tempDir, ".mgreprc.yaml"), "maxFileSize: 100");

      const result = getLocalConfigPath(tempDir);
      expect(result).toBe(path.join(tempDir, ".mgreprc.yaml"));
    });

    it("returns existing .yml file path when .yaml does not exist", () => {
      fs.writeFileSync(path.join(tempDir, ".mgreprc.yml"), "maxFileSize: 100");

      const result = getLocalConfigPath(tempDir);
      expect(result).toBe(path.join(tempDir, ".mgreprc.yml"));
    });
  });

  describe("getConfigLocations", () => {
    it("returns both locations with exists=false when neither exist", () => {
      const result = getConfigLocations(tempDir);

      expect(result.global.target).toBe("global");
      expect(result.global.exists).toBe(false);
      expect(result.local.target).toBe("local");
      expect(result.local.exists).toBe(false);
    });

    it("returns exists=true when files exist", () => {
      const globalDir = path.join(tempDir, ".config/mgrep");
      fs.mkdirSync(globalDir, { recursive: true });
      fs.writeFileSync(path.join(globalDir, "config.yaml"), "maxFileSize: 100");
      fs.writeFileSync(path.join(tempDir, ".mgreprc.yaml"), "maxFileSize: 200");

      const result = getConfigLocations(tempDir);

      expect(result.global.exists).toBe(true);
      expect(result.local.exists).toBe(true);
    });
  });

  describe("readConfigFile", () => {
    it("returns null when file does not exist", () => {
      const result = readConfigFile(path.join(tempDir, "nonexistent.yaml"));
      expect(result).toBeNull();
    });

    it("returns empty object for empty file", () => {
      const filePath = path.join(tempDir, "empty.yaml");
      fs.writeFileSync(filePath, "");

      const result = readConfigFile(filePath);
      expect(result).toEqual({});
    });

    it("parses valid YAML config", () => {
      const filePath = path.join(tempDir, "config.yaml");
      fs.writeFileSync(
        filePath,
        `
maxFileSize: 5242880
embeddings:
  provider: google
  model: gemini-embedding-001
`,
      );

      const result = readConfigFile(filePath);

      expect(result?.maxFileSize).toBe(5242880);
      expect(result?.embeddings?.provider).toBe("google");
      expect(result?.embeddings?.model).toBe("gemini-embedding-001");
    });

    it("throws on invalid YAML", () => {
      const filePath = path.join(tempDir, "invalid.yaml");
      fs.writeFileSync(filePath, "invalid: [yaml: syntax");

      expect(() => readConfigFile(filePath)).toThrow();
    });

    it("throws on invalid config schema", () => {
      const filePath = path.join(tempDir, "invalid-schema.yaml");
      fs.writeFileSync(filePath, "embeddings:\n  provider: invalid-provider");

      expect(() => readConfigFile(filePath)).toThrow();
    });
  });

  describe("readConfigFileRaw", () => {
    it("returns null when file does not exist", () => {
      const result = readConfigFileRaw(path.join(tempDir, "nonexistent.yaml"));
      expect(result).toBeNull();
    });

    it("returns raw content", () => {
      const filePath = path.join(tempDir, "config.yaml");
      const content = "maxFileSize: 100\n";
      fs.writeFileSync(filePath, content);

      const result = readConfigFileRaw(filePath);
      expect(result).toBe(content);
    });
  });

  describe("writeConfigFile", () => {
    it("creates parent directories if they do not exist", () => {
      const filePath = path.join(tempDir, "nested/dir/config.yaml");

      writeConfigFile(filePath, { maxFileSize: 100 });

      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("writes config with default header", () => {
      const filePath = path.join(tempDir, "config.yaml");

      writeConfigFile(filePath, { maxFileSize: 100 });

      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("# mgrep configuration");
      expect(content).toContain("maxFileSize: 100");
    });

    it("writes config with custom header", () => {
      const filePath = path.join(tempDir, "config.yaml");

      writeConfigFile(
        filePath,
        { maxFileSize: 100 },
        { header: "# Custom\n\n" },
      );

      const content = fs.readFileSync(filePath, "utf-8");
      expect(content.startsWith("# Custom\n\n")).toBe(true);
    });

    it("writes nested config correctly", () => {
      const filePath = path.join(tempDir, "config.yaml");

      writeConfigFile(filePath, {
        embeddings: {
          provider: "openai",
          model: "text-embedding-3-small",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        },
      });

      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("embeddings:");
      expect(content).toContain("provider: openai");
      expect(content).toContain("model: text-embedding-3-small");
    });
  });

  describe("updateConfigFile", () => {
    it("creates file if it does not exist", () => {
      const filePath = path.join(tempDir, "new-config.yaml");

      updateConfigFile(filePath, { maxFileSize: 100 });

      expect(fs.existsSync(filePath)).toBe(true);
      const result = readConfigFile(filePath);
      expect(result?.maxFileSize).toBe(100);
    });

    it("preserves existing fields when updating", () => {
      const filePath = path.join(tempDir, "config.yaml");
      writeConfigFile(filePath, {
        maxFileSize: 100,
        embeddings: {
          provider: "openai",
          model: "text-embedding-3-small",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        },
      });

      updateConfigFile(filePath, { maxFileSize: 200 });

      const result = readConfigFile(filePath);
      expect(result?.maxFileSize).toBe(200);
      expect(result?.embeddings?.provider).toBe("openai");
    });

    it("merges nested objects", () => {
      const filePath = path.join(tempDir, "config.yaml");
      writeConfigFile(filePath, {
        embeddings: {
          provider: "openai",
          model: "text-embedding-3-small",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        },
      });

      updateConfigFile(filePath, {
        embeddings: {
          provider: "google",
          model: "gemini-embedding-001",
          batchSize: 50,
          timeoutMs: 30000,
          maxRetries: 3,
        },
      });

      const result = readConfigFile(filePath);
      expect(result?.embeddings?.provider).toBe("google");
      expect(result?.embeddings?.model).toBe("gemini-embedding-001");
      expect(result?.embeddings?.batchSize).toBe(50);
    });
  });

  describe("deepMergePartialConfig", () => {
    it("returns base when override is empty", () => {
      const base = { maxFileSize: 100 };
      const result = deepMergePartialConfig(base, {});
      expect(result).toEqual(base);
    });

    it("overrides top-level fields", () => {
      const base = { maxFileSize: 100 };
      const override = { maxFileSize: 200 };
      const result = deepMergePartialConfig(base, override);
      expect(result.maxFileSize).toBe(200);
    });

    it("merges nested objects", () => {
      const base = {
        embeddings: {
          provider: "openai" as const,
          model: "old-model",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        },
      };
      const override = {
        embeddings: {
          provider: "google" as const,
          model: "new-model",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        },
      };
      const result = deepMergePartialConfig(base, override);
      expect(result.embeddings?.provider).toBe("google");
      expect(result.embeddings?.model).toBe("new-model");
    });

    it("merges ignore config correctly", () => {
      const base = {
        ignore: {
          categories: {
            vendor: true,
            generated: true,
            binary: true,
            config: false,
          },
          additional: ["pattern1"],
          exceptions: [],
          detectGenerated: true,
        },
      };
      const override = {
        ignore: {
          categories: {
            vendor: false,
            generated: true,
            binary: true,
            config: false,
          },
          additional: ["pattern2"],
          exceptions: ["exception1"],
          detectGenerated: false,
        },
      };
      const result = deepMergePartialConfig(base, override);
      expect(result.ignore?.categories?.vendor).toBe(false);
      expect(result.ignore?.additional).toEqual(["pattern2"]);
      expect(result.ignore?.exceptions).toEqual(["exception1"]);
      expect(result.ignore?.detectGenerated).toBe(false);
    });
  });

  describe("deleteConfigFile", () => {
    it("returns false when file does not exist", () => {
      const result = deleteConfigFile(path.join(tempDir, "nonexistent.yaml"));
      expect(result).toBe(false);
    });

    it("deletes existing file and returns true", () => {
      const filePath = path.join(tempDir, "config.yaml");
      fs.writeFileSync(filePath, "maxFileSize: 100");

      const result = deleteConfigFile(filePath);

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe("configFileExists", () => {
    it("returns false when file does not exist", () => {
      const result = configFileExists(path.join(tempDir, "nonexistent.yaml"));
      expect(result).toBe(false);
    });

    it("returns true when file exists", () => {
      const filePath = path.join(tempDir, "config.yaml");
      fs.writeFileSync(filePath, "");

      const result = configFileExists(filePath);
      expect(result).toBe(true);
    });
  });

  describe("getConfigPath", () => {
    it("returns global path for global target", () => {
      const result = getConfigPath("global", tempDir);
      expect(result).toBe(path.join(tempDir, ".config/mgrep/config.yaml"));
    });

    it("returns local path for local target", () => {
      const result = getConfigPath("local", tempDir);
      expect(result).toBe(path.join(tempDir, ".mgreprc.yaml"));
    });
  });
});
