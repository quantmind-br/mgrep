import type OpenAI from "openai";
import type {
  EmbeddingResult,
  EmbeddingsClient,
  EmbeddingsConfig,
} from "../types.js";

/**
 * OpenAI-compatible embeddings client
 * Works with OpenAI, Ollama, vLLM, LiteLLM, and other OpenAI-compatible APIs
 */
export class OpenAIEmbeddings implements EmbeddingsClient {
  private client: OpenAI;
  private model: string;
  private dimensions?: number;
  private batchSize: number;
  private isOllama: boolean;

  /**
   * @param config - Embeddings configuration
   * @param client - OpenAI client instance
   * @param isOllama - If true, won't send `dimensions` param (Ollama ignores it)
   */
  constructor(config: EmbeddingsConfig, client: OpenAI, isOllama = false) {
    this.client = client;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.batchSize = config.batchSize || 100;
    this.isOllama = isOllama;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      // Ollama ignores dimensions param - only send for OpenAI-native API
      ...(this.isOllama ? {} : { dimensions: this.dimensions }),
    });

    return {
      embedding: response.data[0].embedding,
      tokenCount: response.usage?.total_tokens,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        // Ollama ignores dimensions param - only send for OpenAI-native API
        ...(this.isOllama ? {} : { dimensions: this.dimensions }),
      });

      for (const data of response.data) {
        results.push({
          embedding: data.embedding,
        });
      }
    }

    return results;
  }

  async getDimensions(): Promise<number> {
    if (this.dimensions) {
      return this.dimensions;
    }

    // Auto-detect by generating a test embedding
    const result = await this.embed("test");
    this.dimensions = result.embedding.length;
    return this.dimensions;
  }
}
