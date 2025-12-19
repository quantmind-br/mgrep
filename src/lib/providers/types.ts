/**
 * Supported provider types for embeddings and LLM
 */
export type ProviderType = "openai" | "google" | "anthropic" | "ollama";

/**
 * Configuration for embedding providers
 */
export interface EmbeddingsConfig {
  provider: ProviderType;
  model: string;
  baseUrl?: string; // Custom endpoint (for Ollama, vLLM, etc)
  apiKey?: string; // API key (optional for local providers)
  dimensions?: number; // Vector dimensions (auto-detected if not set)
  batchSize?: number; // Batch size for embedding requests
  timeoutMs?: number; // Timeout in milliseconds
  maxRetries?: number; // Maximum number of retries
}

/**
 * Configuration for LLM providers
 */
export interface LLMConfig {
  provider: ProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  embedding: number[];
  tokenCount?: number;
}

/**
 * Interface for embedding clients
 */
export interface EmbeddingsClient {
  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Get the dimension of the embedding vectors
   */
  getDimensions(): Promise<number>;
}

/**
 * Chat message for LLM
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * LLM completion result
 */
export interface CompletionResult {
  content: string;
  tokenCount?: {
    prompt: number;
    completion: number;
  };
}

/**
 * Interface for LLM clients
 */
export interface LLMClient {
  /**
   * Generate a completion for a chat conversation
   */
  chat(messages: ChatMessage[]): Promise<CompletionResult>;

  /**
   * Generate a completion with streaming (optional)
   */
  chatStream?(messages: ChatMessage[]): AsyncGenerator<string>;
}
