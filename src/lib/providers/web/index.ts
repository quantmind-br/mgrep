import { TavilyClient } from "./tavily.js";
import type { WebSearchClient, WebSearchConfig } from "./types.js";

export { TavilyClient } from "./tavily.js";
export type {
  WebSearchClient,
  WebSearchConfig,
  WebSearchResponse,
  WebSearchResult,
} from "./types.js";

/**
 * Creates a web search client based on the configuration
 */
export function createWebSearchClient(
  config: WebSearchConfig,
): WebSearchClient {
  switch (config.provider) {
    case "tavily":
      return new TavilyClient(config);
    default:
      throw new Error(`Unsupported web search provider: ${config.provider}`);
  }
}
