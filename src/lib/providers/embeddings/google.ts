import type {
  EmbeddingResult,
  EmbeddingsClient,
  EmbeddingsConfig,
} from "../types.js";

interface GoogleEmbeddingResponse {
  embedding: {
    values: number[];
  };
}

interface GoogleBatchEmbeddingResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

/**
 * Google Gemini embeddings client
 */
export class GoogleEmbeddings implements EmbeddingsClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private dimensions?: number;
  private batchSize: number;
  private timeoutMs: number;

  constructor(config: EmbeddingsConfig) {
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || "";
    this.model = config.model || "gemini-embedding-001";
    this.baseUrl =
      config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    this.dimensions = config.dimensions;
    this.batchSize = config.batchSize || 100;
    this.timeoutMs = config.timeoutMs || 30000;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:embedContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            outputDimensionality: this.dimensions,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google API error: ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as GoogleEmbeddingResponse;
      return {
        embedding: data.embedding.values,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(
          `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: batch.map((text) => ({
                model: `models/${this.model}`,
                content: { parts: [{ text }] },
                outputDimensionality: this.dimensions,
              })),
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Google API error: ${response.statusText} - ${errorText}`,
          );
        }

        const data = (await response.json()) as GoogleBatchEmbeddingResponse;
        for (const e of data.embeddings) {
          results.push({
            embedding: e.values,
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return results;
  }

  async getDimensions(): Promise<number> {
    if (this.dimensions) {
      return this.dimensions;
    }
    const result = await this.embed("test");
    this.dimensions = result.embedding.length;
    return this.dimensions;
  }
}
