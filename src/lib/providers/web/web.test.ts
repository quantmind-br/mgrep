import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSearchClient, TavilyClient } from "./index.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("web providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear env vars
    delete process.env.MGREP_TAVILY_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createWebSearchClient", () => {
    it("should create TavilyClient for tavily provider", () => {
      const client = createWebSearchClient({
        provider: "tavily",
        apiKey: "test-api-key",
      });

      expect(client).toBeInstanceOf(TavilyClient);
    });

    it("should throw for unsupported provider", () => {
      expect(() =>
        createWebSearchClient({
          provider: "unknown" as any,
          apiKey: "test",
        }),
      ).toThrow("Unsupported web search provider");
    });
  });

  describe("TavilyClient", () => {
    describe("constructor", () => {
      it("should create client with config API key", () => {
        const client = new TavilyClient({
          provider: "tavily",
          apiKey: "test-api-key",
        });

        expect(client).toBeDefined();
      });

      it("should create client with env API key", () => {
        process.env.MGREP_TAVILY_API_KEY = "env-api-key";

        const client = new TavilyClient({
          provider: "tavily",
        });

        expect(client).toBeDefined();
      });

      it("should throw if no API key provided", () => {
        expect(
          () =>
            new TavilyClient({
              provider: "tavily",
            }),
        ).toThrow("Tavily API key is required");
      });

      it("should use default values", () => {
        const client = new TavilyClient({
          provider: "tavily",
          apiKey: "test-key",
        });

        expect(client).toBeDefined();
      });

      it("should accept custom config", () => {
        const client = new TavilyClient({
          provider: "tavily",
          apiKey: "test-key",
          maxResults: 20,
          searchDepth: "advanced",
          includeImages: true,
          includeRawContent: true,
        });

        expect(client).toBeDefined();
      });
    });

    describe("search", () => {
      let client: TavilyClient;

      beforeEach(() => {
        client = new TavilyClient({
          provider: "tavily",
          apiKey: "test-api-key",
        });
      });

      it("should make search request with correct parameters", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              query: "test query",
              results: [
                {
                  title: "Test Result",
                  url: "https://example.com",
                  content: "Test content",
                  score: 0.95,
                },
              ],
            }),
        });

        const _result = await client.search("test query");

        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.tavily.com/search",
          expect.objectContaining({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }),
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.query).toBe("test query");
        expect(body.api_key).toBe("test-api-key");
      });

      it("should return formatted results", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              query: "test query",
              answer: "Test answer",
              images: ["http://image.png"],
              results: [
                {
                  title: "Result 1",
                  url: "https://example1.com",
                  content: "Content 1",
                  score: 0.9,
                  published_date: "2024-01-01",
                  raw_content: "Raw content",
                  favicon: "https://favicon.ico",
                },
                {
                  title: "Result 2",
                  url: "https://example2.com",
                  content: "Content 2",
                  score: 0.8,
                },
              ],
            }),
        });

        const result = await client.search("test query");

        expect(result.query).toBe("test query");
        expect(result.answer).toBe("Test answer");
        expect(result.images).toEqual(["http://image.png"]);
        expect(result.results).toHaveLength(2);
        expect(result.results[0]).toEqual({
          title: "Result 1",
          url: "https://example1.com",
          content: "Content 1",
          score: 0.9,
          publishedDate: "2024-01-01",
          rawContent: "Raw content",
          favicon: "https://favicon.ico",
        });
      });

      it("should pass search options", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              query: "test",
              results: [],
            }),
        });

        await client.search("test", {
          maxResults: 5,
          searchDepth: "advanced",
          includeDomains: ["example.com"],
          excludeDomains: ["bad.com"],
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_results).toBe(5);
        expect(body.search_depth).toBe("advanced");
        expect(body.include_domains).toEqual(["example.com"]);
        expect(body.exclude_domains).toEqual(["bad.com"]);
      });

      it("should handle 401 unauthorized error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized"),
        });

        await expect(client.search("test")).rejects.toThrow(
          "Invalid Tavily API key",
        );
      });

      it("should handle 429 rate limit error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve("Too many requests"),
        });

        await expect(client.search("test")).rejects.toThrow(
          "Tavily API rate limit exceeded",
        );
      });

      it("should handle other API errors", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal server error"),
        });

        await expect(client.search("test")).rejects.toThrow(
          "Tavily API error: 500",
        );
      });

      it("should handle network errors", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        await expect(client.search("test")).rejects.toThrow("Network error");
      });

      it("should handle non-Error exceptions", async () => {
        mockFetch.mockRejectedValueOnce("String error");

        await expect(client.search("test")).rejects.toThrow(
          "Tavily search failed: String error",
        );
      });

      it("should use default maxResults from config", async () => {
        const customClient = new TavilyClient({
          provider: "tavily",
          apiKey: "test-key",
          maxResults: 15,
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ query: "test", results: [] }),
        });

        await customClient.search("test");

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_results).toBe(15);
      });

      it("should use default searchDepth from config", async () => {
        const customClient = new TavilyClient({
          provider: "tavily",
          apiKey: "test-key",
          searchDepth: "advanced",
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ query: "test", results: [] }),
        });

        await customClient.search("test");

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.search_depth).toBe("advanced");
      });

      it("should not include empty domain arrays", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ query: "test", results: [] }),
        });

        await client.search("test", {
          includeDomains: [],
          excludeDomains: [],
        });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.include_domains).toBeUndefined();
        expect(body.exclude_domains).toBeUndefined();
      });
    });
  });
});
