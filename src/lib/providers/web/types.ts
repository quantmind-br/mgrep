/**
 * Configuration for web search providers
 */
export interface WebSearchConfig {
  provider: "tavily";
  apiKey?: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeImages?: boolean;
  includeRawContent?: boolean;
}

/**
 * Web search result from provider
 */
export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
  rawContent?: string;
  favicon?: string;
}

/**
 * Web search response
 */
export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  answer?: string;
  images?: Array<string | { url: string; description?: string }>;
}

/**
 * Interface for web search clients
 */
export interface WebSearchClient {
  /**
   * Search the web for a query
   */
  search(
    query: string,
    options?: {
      maxResults?: number;
      searchDepth?: "basic" | "advanced";
      includeDomains?: string[];
      excludeDomains?: string[];
    },
  ): Promise<WebSearchResponse>;
}
