import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearConfigCache,
  exceedsMaxFileSize,
  formatFileSize,
  getConfigPaths,
  getGlobalConfigPaths,
  getLocalConfigPaths,
  loadConfig,
  loadConfigWithOptions,
  reloadConfig,
} from "./config.js";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrep-test-"));
    clearConfigCache();
    // Clear relevant env vars
    delete process.env.MGREP_MAX_FILE_SIZE;
    delete process.env.MGREP_EMBEDDINGS_PROVIDER;
    delete process.env.MGREP_EMBEDDINGS_MODEL;
    delete process.env.MGREP_EMBEDDINGS_API_KEY;
    delete process.env.MGREP_LLM_PROVIDER;
    delete process.env.MGREP_LLM_MODEL;
    delete process.env.MGREP_LLM_API_KEY;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    clearConfigCache();
  });

  describe("loadConfig", () => {
    it("should return default config when no config files exist", () => {
      const config = loadConfig(tempDir);

      expect(config.maxFileSize).toBe(10 * 1024 * 1024);
      expect(config.embeddings.provider).toBe("openai");
      expect(config.embeddings.model).toBe("text-embedding-3-small");
      expect(config.llm.provider).toBe("openai");
      expect(config.llm.model).toBe("gpt-4o-mini");
      expect(config.qdrant.url).toBe("http://localhost:6333");
    });

    it("should load config from .mgreprc.yaml", () => {
      const configContent = `
maxFileSize: 5242880
embeddings:
  provider: google
  model: gemini-embedding-001
llm:
  provider: google
  model: gemini-2.0-flash
`;
      fs.writeFileSync(path.join(tempDir, ".mgreprc.yaml"), configContent);

      const config = loadConfig(tempDir);

      expect(config.maxFileSize).toBe(5242880);
      expect(config.embeddings.provider).toBe("google");
      expect(config.embeddings.model).toBe("gemini-embedding-001");
      expect(config.llm.provider).toBe("google");
      expect(config.llm.model).toBe("gemini-2.0-flash");
    });

    it("should load config from .mgreprc.yml", () => {
      const configContent = `
embeddings:
  provider: ollama
  model: nomic-embed-text
`;
      fs.writeFileSync(path.join(tempDir, ".mgreprc.yml"), configContent);

      const config = loadConfig(tempDir);

      expect(config.embeddings.provider).toBe("ollama");
      expect(config.embeddings.model).toBe("nomic-embed-text");
    });

    it("should prefer .mgreprc.yaml over .mgreprc.yml", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "embeddings:\n  provider: google\n",
      );
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yml"),
        "embeddings:\n  provider: ollama\n",
      );

      const config = loadConfig(tempDir);

      expect(config.embeddings.provider).toBe("google");
    });

    it("should override config with environment variables", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "embeddings:\n  provider: google\n",
      );
      process.env.MGREP_EMBEDDINGS_PROVIDER = "ollama";

      const config = loadConfig(tempDir);

      expect(config.embeddings.provider).toBe("ollama");
    });

    it("should not override provider when only API key is set via env", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "embeddings:\n  provider: google\n  model: gemini-embedding-001\n",
      );
      process.env.MGREP_EMBEDDINGS_API_KEY = "test-api-key";

      clearConfigCache();
      const config = loadConfig(tempDir);

      // Provider should remain google, not be overridden to openai
      expect(config.embeddings.provider).toBe("google");
      expect(config.embeddings.apiKey).toBe("test-api-key");
    });

    it("should cache config results", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );

      const config1 = loadConfig(tempDir);
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 2000\n",
      );
      const config2 = loadConfig(tempDir);

      expect(config1).toBe(config2);
      expect(config1.maxFileSize).toBe(1000);
    });

    it("should apply CLI options with highest priority", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );
      process.env.MGREP_MAX_FILE_SIZE = "2000";

      const config = loadConfig(tempDir, { maxFileSize: 3000 });

      expect(config.maxFileSize).toBe(3000);
    });
  });

  describe("reloadConfig", () => {
    it("should reload config from disk bypassing cache", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );
      const config1 = loadConfig(tempDir);

      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 2000\n",
      );
      const config2 = reloadConfig(tempDir);

      expect(config1.maxFileSize).toBe(1000);
      expect(config2?.maxFileSize).toBe(2000);
    });

    it("should handle invalid config gracefully", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );
      loadConfig(tempDir);

      // Write invalid YAML
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: [invalid\n",
      );
      const config = reloadConfig(tempDir);

      // Should return config (possibly default) and not crash
      // Invalid YAML is logged as warning but doesn't cause null return
      expect(config).toBeDefined();
    });
  });

  describe("loadConfigWithOptions", () => {
    it("should reload when reload option is true", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );
      loadConfig(tempDir);

      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 2000\n",
      );
      const config = loadConfigWithOptions(tempDir, {}, { reload: true });

      expect(config?.maxFileSize).toBe(2000);
    });

    it("should use cache when reload is false", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );
      loadConfig(tempDir);

      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 2000\n",
      );
      const config = loadConfigWithOptions(tempDir, {}, { reload: false });

      expect(config?.maxFileSize).toBe(1000);
    });
  });

  describe("getConfigPaths", () => {
    it("should return local and global config paths", () => {
      const paths = getConfigPaths(tempDir);

      expect(paths).toContain(path.join(tempDir, ".mgreprc.yaml"));
      expect(paths).toContain(path.join(tempDir, ".mgreprc.yml"));
      expect(paths.length).toBeGreaterThan(2);
    });
  });

  describe("getLocalConfigPaths", () => {
    it("should return local config paths", () => {
      const paths = getLocalConfigPaths(tempDir);

      expect(paths).toEqual([
        path.join(tempDir, ".mgreprc.yaml"),
        path.join(tempDir, ".mgreprc.yml"),
      ]);
    });
  });

  describe("getGlobalConfigPaths", () => {
    it("should return global config paths", () => {
      const paths = getGlobalConfigPaths();

      expect(paths.length).toBe(2);
      expect(paths[0]).toContain(".config/mgrep/config.yaml");
      expect(paths[1]).toContain(".config/mgrep/config.yml");
    });
  });

  describe("clearConfigCache", () => {
    it("should clear the config cache", () => {
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 1000\n",
      );
      const config1 = loadConfig(tempDir);

      clearConfigCache();
      fs.writeFileSync(
        path.join(tempDir, ".mgreprc.yaml"),
        "maxFileSize: 2000\n",
      );
      const config2 = loadConfig(tempDir);

      expect(config1.maxFileSize).toBe(1000);
      expect(config2.maxFileSize).toBe(2000);
    });
  });

  describe("exceedsMaxFileSize", () => {
    it("should return true for files larger than max size", () => {
      const filePath = path.join(tempDir, "large.txt");
      fs.writeFileSync(filePath, "x".repeat(1000));

      expect(exceedsMaxFileSize(filePath, 500)).toBe(true);
    });

    it("should return false for files smaller than max size", () => {
      const filePath = path.join(tempDir, "small.txt");
      fs.writeFileSync(filePath, "x".repeat(100));

      expect(exceedsMaxFileSize(filePath, 500)).toBe(false);
    });

    it("should return false for non-existent files", () => {
      expect(exceedsMaxFileSize("/non/existent/file.txt", 500)).toBe(false);
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes correctly", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(100)).toBe("100 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("should format kilobytes correctly", () => {
      expect(formatFileSize(1024)).toBe("1.00 KB");
      expect(formatFileSize(1536)).toBe("1.50 KB");
      expect(formatFileSize(10240)).toBe("10.00 KB");
    });

    it("should format megabytes correctly", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
      expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
    });

    it("should format gigabytes correctly", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.00 GB");
    });
  });
});
