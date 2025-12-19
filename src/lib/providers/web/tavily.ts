import type {
  WebSearchClient,
  WebSearchConfig,
  WebSearchResponse,
} from "./types.js";

const TAVILY_API_URL = "https://api.tavily.com/search";

interface TavilySearchParams {
  query: string;
  api_key: string;
  search_depth?: "basic" | "advanced";
  max_results?: number;
  include_images?: boolean;
  include_raw_content?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

interface TavilyApiResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
  raw_content?: string;
  favicon?: string;
}

interface TavilyApiResponse {
  query: string;
  answer?: string;
  images?: Array<string | { url: string; description?: string }>;
  results: TavilyApiResult[];
}

/**
 * Tavily web search client
 */
export class TavilyClient implements WebSearchClient {
  private apiKey: string;
  private defaultMaxResults: number;
  private defaultSearchDepth: "basic" | "advanced";
  private includeImages: boolean;
  private includeRawContent: boolean;

  constructor(config: WebSearchConfig) {
    const apiKey = config.apiKey || process.env.MGREP_TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Tavily API key is required. Set MGREP_TAVILY_API_KEY or configure tavily.apiKey",
      );
    }
    this.apiKey = apiKey;
    this.defaultMaxResults = config.maxResults ?? 10;
    this.defaultSearchDepth = config.searchDepth ?? "basic";
    this.includeImages = config.includeImages ?? false;
    this.includeRawContent = config.includeRawContent ?? false;
  }

  async search(
    query: string,
    options?: {
      maxResults?: number;
      searchDepth?: "basic" | "advanced";
      includeDomains?: string[];
      excludeDomains?: string[];
    },
  ): Promise<WebSearchResponse> {
    const params: TavilySearchParams = {
      query,
      api_key: this.apiKey,
      search_depth: options?.searchDepth ?? this.defaultSearchDepth,
      max_results: options?.maxResults ?? this.defaultMaxResults,
      include_images: this.includeImages,
      include_raw_content: this.includeRawContent,
    };

    if (options?.includeDomains && options.includeDomains.length > 0) {
      params.include_domains = options.includeDomains;
    }

    if (options?.excludeDomains && options.excludeDomains.length > 0) {
      params.exclude_domains = options.excludeDomains;
    }

    try {
      const response = await fetch(TAVILY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new Error("Invalid Tavily API key");
        }
        if (response.status === 429) {
          throw new Error("Tavily API rate limit exceeded");
        }
        throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
      }

      const data: TavilyApiResponse = await response.json();

      return {
        query: data.query,
        answer: data.answer,
        images: data.images,
        results: data.results.map((result) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score,
          publishedDate: result.published_date,
          rawContent: result.raw_content,
          favicon: result.favicon,
        })),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Tavily search failed: ${String(error)}`);
    }
  }
}
