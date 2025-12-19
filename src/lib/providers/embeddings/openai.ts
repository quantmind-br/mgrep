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

  constructor(config: EmbeddingsConfig, client: OpenAI) {
    this.client = client;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.batchSize = config.batchSize || 100;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });

    return {
      embedding: response.data[0].embedding,
      tokenCount: response.usage?.total_tokens,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dimensions,
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
