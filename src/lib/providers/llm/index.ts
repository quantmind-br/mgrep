import OpenAI from "openai";
import type { LLMClient, LLMConfig } from "../types.js";
import { AnthropicLLM } from "./anthropic.js";
import { GoogleLLM } from "./google.js";
import { OpenAILLM } from "./openai.js";

export { AnthropicLLM } from "./anthropic.js";
export { GoogleLLM } from "./google.js";
export { OpenAILLM } from "./openai.js";

/**
 * Creates an LLM client based on the configuration
 */
export function createLLMClient(config: LLMConfig): LLMClient {
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
      return new OpenAILLM(config, client);
    }
    case "google":
      return new GoogleLLM(config);
    case "anthropic":
      return new AnthropicLLM(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
