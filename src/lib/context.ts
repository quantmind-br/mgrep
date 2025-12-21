import { loadConfig, type TavilyConfig } from "./config.js";
import {
  type FileSystem,
  type FileSystemOptions,
  NodeFileSystem,
} from "./file.js";
import { type Git, NodeGit } from "./git.js";
import { createEmbeddingsClient, createLLMClient } from "./providers/index.js";
import {
  createWebSearchClient,
  type WebSearchClient,
} from "./providers/web/index.js";
import { QdrantStore } from "./qdrant-store.js";
import { type Store, TestStore } from "./store.js";

export const isTest = process.env.MGREP_IS_TEST === "1";

/**
 * Creates a Store instance using Qdrant and configured providers
 */
export async function createStore(): Promise<Store> {
  if (isTest) {
    return new TestStore();
  }

  const config = loadConfig(process.cwd());

  // Create embeddings client
  const embeddingsClient = createEmbeddingsClient(config.embeddings);

  // Create LLM client
  const llmClient = createLLMClient(config.llm);

  // Create Qdrant store
  return new QdrantStore({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey,
    embeddingsClient,
    llmClient,
    collectionPrefix: config.qdrant.collectionPrefix,
  });
}

/**
 * Creates a Git instance
 */
export function createGit(): Git {
  return new NodeGit();
}

/**
 * Creates a FileSystem instance
 */
export function createFileSystem(
  options: FileSystemOptions = { ignorePatterns: [] },
): FileSystem {
  return new NodeFileSystem(createGit(), options);
}

/**
 * Creates a WebSearchClient instance for Tavily
 */
export function createWebSearchClientFromConfig(
  tavilyConfig: TavilyConfig,
): WebSearchClient {
  return createWebSearchClient({
    provider: "tavily",
    apiKey: tavilyConfig.apiKey,
    maxResults: tavilyConfig.maxResults,
    searchDepth: tavilyConfig.searchDepth,
    includeImages: tavilyConfig.includeImages,
    includeRawContent: tavilyConfig.includeRawContent,
  });
}
