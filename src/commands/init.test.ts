import { describe, expect, it } from "vitest";
import {
  buildConfig,
  PROVIDER_DEFAULTS,
  validateApiKeyFormat,
} from "./init.js";

describe("init command helpers", () => {
  describe("validateApiKeyFormat", () => {
    it("accepts OpenAI keys starting with sk-", () => {
      expect(validateApiKeyFormat("openai", "sk-test")).toBe(true);
    });

    it("rejects OpenAI keys without sk- prefix", () => {
      expect(validateApiKeyFormat("openai", "pk-test")).toBe(false);
    });

    it("accepts Anthropic keys starting with sk-ant-", () => {
      expect(validateApiKeyFormat("anthropic", "sk-ant-test")).toBe(true);
    });

    it("rejects empty API key", () => {
      expect(validateApiKeyFormat("google", "")).toBe(false);
    });
  });

  describe("buildConfig", () => {
    it("uses OpenAI defaults", () => {
      const config = buildConfig({ provider: "openai" });
      expect(config.embeddings.provider).toBe("openai");
      expect(config.embeddings.model).toBe("text-embedding-3-small");
      expect(config.llm.provider).toBe("openai");
      expect(config.llm.model).toBe("gpt-4o-mini");
    });

    it("uses OpenAI embeddings for Anthropic", () => {
      const config = buildConfig({ provider: "anthropic" });
      expect(config.embeddings.provider).toBe("openai");
      expect(config.llm.provider).toBe("anthropic");
    });

    it("applies Ollama base URL", () => {
      const config = buildConfig({
        provider: "ollama",
        ollamaBaseUrl: "http://localhost:11434/v1",
      });
      expect(config.embeddings.baseUrl).toBe("http://localhost:11434/v1");
      expect(config.llm.baseUrl).toBe("http://localhost:11434/v1");
    });
  });

  describe("PROVIDER_DEFAULTS", () => {
    it("defines defaults for all providers", () => {
      const providers = Object.keys(PROVIDER_DEFAULTS).sort();
      expect(providers).toEqual([
        "anthropic",
        "google",
        "ollama",
        "openai",
      ]);

      for (const [provider, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
        expect(defaults.embeddingModel).toBeTruthy();
        expect(defaults.embeddingProvider).toBeTruthy();
        expect(defaults.llmModel).toBeTruthy();
        expect(defaults.embeddingProvider).toMatch(
          /openai|google|anthropic|ollama/,
        );
        expect(provider).toMatch(/openai|google|anthropic|ollama/);
      }
    });
  });
});
