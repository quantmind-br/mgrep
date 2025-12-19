import OpenAI from "openai";
import type { EmbeddingsClient, EmbeddingsConfig } from "../types.js";
import { GoogleEmbeddings } from "./google.js";
import { OpenAIEmbeddings } from "./openai.js";

export { GoogleEmbeddings } from "./google.js";
export { OpenAIEmbeddings } from "./openai.js";

/**
 * Creates an embeddings client based on the configuration
 */
export function createEmbeddingsClient(
  config: EmbeddingsConfig,
): EmbeddingsClient {
  switch (config.provider) {
    case "openai":
    case "ollama": {
      // OpenAI-compatible client (works with OpenAI, Ollama, vLLM, LiteLLM)
      const client = new OpenAI({
        apiKey:
          config.apiKey ||
          process.env.OPENAI_API_KEY ||
          (config.provider === "ollama" ? "ollama" : undefined),
        baseURL: config.baseUrl || process.env.OPENAI_BASE_URL,
        timeout: config.timeoutMs,
        maxRetries: config.maxRetries,
      });
      return new OpenAIEmbeddings(config, client);
    }
    case "google":
      return new GoogleEmbeddings(config);
    case "anthropic":
      // Anthropic doesn't offer native embeddings, use OpenAI-compatible
      throw new Error(
        "Anthropic does not provide embeddings. Use OpenAI, Google, or Ollama for embeddings.",
      );
    default:
      throw new Error(`Unknown embeddings provider: ${config.provider}`);
  }
}
