import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleEmbeddings } from "./google.js";
import { createEmbeddingsClient } from "./index.js";
import { OpenAIEmbeddings } from "./openai.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createEmbeddingsClient", () => {
    it("should create OpenAI client for openai provider", () => {
      const client = createEmbeddingsClient({
        provider: "openai",
        model: "text-embedding-3-small",
        apiKey: "test-api-key",
        batchSize: 100,
        timeoutMs: 30000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
      expect(client.embed).toBeDefined();
      expect(client.embedBatch).toBeDefined();
      expect(client.getDimensions).toBeDefined();
    });

    it("should create OpenAI client for ollama provider", () => {
      const client = createEmbeddingsClient({
        provider: "ollama",
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434/v1",
        batchSize: 100,
        timeoutMs: 30000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
    });

    it("should create Google client for google provider", () => {
      const client = createEmbeddingsClient({
        provider: "google",
        model: "gemini-embedding-001",
        batchSize: 100,
        timeoutMs: 30000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
    });

    it("should throw error for anthropic provider", () => {
      expect(() =>
        createEmbeddingsClient({
          provider: "anthropic",
          model: "some-model",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        }),
      ).toThrow("Anthropic does not provide embeddings");
    });

    it("should throw error for unknown provider", () => {
      expect(() =>
        createEmbeddingsClient({
          provider: "unknown" as "openai",
          model: "some-model",
          batchSize: 100,
          timeoutMs: 30000,
          maxRetries: 3,
        }),
      ).toThrow("Unknown embeddings provider");
    });
  });

  describe("GoogleEmbeddings", () => {
    describe("constructor", () => {
      it("should use provided config values", () => {
        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          baseUrl: "https://custom.api.com",
          dimensions: 768,
          batchSize: 50,
          timeoutMs: 30000,
          maxRetries: 2,
        });

        expect(client).toBeDefined();
      });

      it("should use default values when not provided", () => {
        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        expect(client).toBeDefined();
      });

      it("should use GOOGLE_API_KEY from env if not provided", () => {
        const originalEnv = process.env.GOOGLE_API_KEY;
        process.env.GOOGLE_API_KEY = "env-api-key";

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        expect(client).toBeDefined();
        process.env.GOOGLE_API_KEY = originalEnv;
      });
    });

    describe("embed", () => {
      it("should return embedding result", async () => {
        const mockResponse = {
          embedding: {
            values: [0.1, 0.2, 0.3, 0.4, 0.5],
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const result = await client.embed("test text");

        expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      });

      it("should include dimensions in request when specified", async () => {
        const mockResponse = {
          embedding: {
            values: [0.1, 0.2, 0.3],
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          dimensions: 768,
          maxRetries: 3,
          timeoutMs: 30000,
        });

        await client.embed("test");

        expect(mockFetch).toHaveBeenCalled();
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.outputDimensionality).toBe(768);
      });

      it("should throw error on API failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          statusText: "Bad Request",
          text: () => Promise.resolve("Invalid API key"),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        await expect(client.embed("test")).rejects.toThrow(
          "Google API error: Bad Request - Invalid API key",
        );
      });

      it("should abort request on timeout", async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}));

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          timeoutMs: 1000,
          maxRetries: 3,
        });

        client.embed("test");

        vi.advanceTimersByTime(1000);

        expect(mockFetch).toHaveBeenCalled();
        const signal = mockFetch.mock.calls[0][1].signal;
        expect(signal).toBeInstanceOf(AbortSignal);
      });
    });

    describe("embedBatch", () => {
      it("should return array of embedding results", async () => {
        const mockResponse = {
          embeddings: [
            { values: [0.1, 0.2, 0.3] },
            { values: [0.4, 0.5, 0.6] },
            { values: [0.7, 0.8, 0.9] },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const result = await client.embedBatch(["text1", "text2", "text3"]);

        expect(result).toHaveLength(3);
        expect(result[0].embedding).toEqual([0.1, 0.2, 0.3]);
        expect(result[1].embedding).toEqual([0.4, 0.5, 0.6]);
        expect(result[2].embedding).toEqual([0.7, 0.8, 0.9]);
      });

      it("should process in batches larger than batch size", async () => {
        // 150 texts, batch size 100 = 2 batches
        const texts = Array.from({ length: 150 }, (_, i) => `text${i}`);

        // First batch response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              embeddings: Array.from({ length: 100 }, () => ({
                values: [0.1, 0.2, 0.3],
              })),
            }),
        });

        // Second batch response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              embeddings: Array.from({ length: 50 }, () => ({
                values: [0.4, 0.5, 0.6],
              })),
            }),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          batchSize: 100,
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const result = await client.embedBatch(texts);

        expect(result).toHaveLength(150);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it("should include dimensions in batch requests", async () => {
        const mockResponse = {
          embeddings: [{ values: [0.1, 0.2] }],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          dimensions: 512,
          maxRetries: 3,
          timeoutMs: 30000,
        });

        await client.embedBatch(["test"]);

        expect(mockFetch).toHaveBeenCalled();
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.requests[0].outputDimensionality).toBe(512);
      });
    });

    describe("getDimensions", () => {
      it("should return configured dimensions", async () => {
        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          dimensions: 768,
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const dimensions = await client.getDimensions();
        expect(dimensions).toBe(768);
      });

      it("should auto-detect dimensions when not configured", async () => {
        const mockResponse = {
          embedding: {
            values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const dimensions = await client.getDimensions();
        expect(dimensions).toBe(8);
      });

      it("should cache auto-detected dimensions", async () => {
        const mockResponse = {
          embedding: {
            values: [0.1, 0.2, 0.3],
          },
        };

        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleEmbeddings({
          provider: "google",
          model: "gemini-embedding-001",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 30000,
        });

        const dim1 = await client.getDimensions();
        const dim2 = await client.getDimensions();

        expect(dim1).toBe(3);
        expect(dim2).toBe(3);
        // Should only call embed once
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("OpenAIEmbeddings", () => {
    describe("constructor", () => {
      it("should use provided config values", () => {
        const mockClient = {
          embeddings: {
            create: vi.fn(),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 768,
            batchSize: 50,
            maxRetries: 2,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        expect(client).toBeDefined();
      });

      it("should use default values when not provided", () => {
        const mockClient = {
          embeddings: {
            create: vi.fn(),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        expect(client).toBeDefined();
      });
    });

    describe("embed", () => {
      it("should return embedding result", async () => {
        const mockResponse = {
          data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }],
          usage: { total_tokens: 10 },
        };

        const mockClient = {
          embeddings: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const result = await client.embed("test text");

        expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
        expect(result.tokenCount).toBe(10);
      });

      it("should pass dimensions to OpenAI client", async () => {
        const mockResponse = {
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);

        const mockClient = {
          embeddings: {
            create: mockCreate,
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 768,
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        await client.embed("test");

        expect(mockCreate).toHaveBeenCalledWith({
          model: "text-embedding-3-small",
          input: "test",
          dimensions: 768,
        });
      });

      it("should handle missing usage in response", async () => {
        const mockResponse = {
          data: [{ embedding: [0.1, 0.2] }],
        };

        const mockClient = {
          embeddings: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const result = await client.embed("test");

        expect(result.tokenCount).toBeUndefined();
      });
    });

    describe("embedBatch", () => {
      it("should return array of embedding results", async () => {
        const mockResponse = {
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] },
            { embedding: [0.7, 0.8, 0.9] },
          ],
        };

        const mockClient = {
          embeddings: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const result = await client.embedBatch(["text1", "text2", "text3"]);

        expect(result).toHaveLength(3);
        expect(result[0].embedding).toEqual([0.1, 0.2, 0.3]);
        expect(result[1].embedding).toEqual([0.4, 0.5, 0.6]);
        expect(result[2].embedding).toEqual([0.7, 0.8, 0.9]);
      });

      it("should process in batches larger than batch size", async () => {
        // 150 texts, batch size 100 = 2 batches
        const texts = Array.from({ length: 150 }, (_, i) => `text${i}`);

        const mockCreate = vi
          .fn()
          .mockResolvedValueOnce({
            data: Array.from({ length: 100 }, () => ({
              embedding: [0.1, 0.2],
            })),
          })
          .mockResolvedValueOnce({
            data: Array.from({ length: 50 }, () => ({ embedding: [0.3, 0.4] })),
          });

        const mockClient = {
          embeddings: {
            create: mockCreate,
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            batchSize: 100,
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const result = await client.embedBatch(texts);

        expect(result).toHaveLength(150);
        expect(mockCreate).toHaveBeenCalledTimes(2);
      });

      it("should pass dimensions to batch requests", async () => {
        const mockResponse = {
          data: [{ embedding: [0.1, 0.2] }],
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);

        const mockClient = {
          embeddings: {
            create: mockCreate,
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 512,
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        await client.embedBatch(["test"]);

        expect(mockCreate).toHaveBeenCalledWith({
          model: "text-embedding-3-small",
          input: ["test"],
          dimensions: 512,
        });
      });
    });

    describe("getDimensions", () => {
      it("should return configured dimensions", async () => {
        const mockClient = {
          embeddings: {
            create: vi.fn(),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            dimensions: 768,
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const dimensions = await client.getDimensions();
        expect(dimensions).toBe(768);
      });

      it("should auto-detect dimensions when not configured", async () => {
        const mockResponse = {
          data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }],
        };

        const mockClient = {
          embeddings: {
            create: vi.fn().mockResolvedValue(mockResponse),
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const dimensions = await client.getDimensions();
        expect(dimensions).toBe(8);
      });

      it("should cache auto-detected dimensions", async () => {
        const mockResponse = {
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        };

        const mockCreate = vi.fn().mockResolvedValue(mockResponse);

        const mockClient = {
          embeddings: {
            create: mockCreate,
          },
        };

        const client = new OpenAIEmbeddings(
          {
            provider: "openai",
            model: "text-embedding-3-small",
            maxRetries: 3,
            timeoutMs: 30000,
          },
          mockClient as never,
        );

        const dim1 = await client.getDimensions();
        const dim2 = await client.getDimensions();

        expect(dim1).toBe(3);
        expect(dim2).toBe(3);
        // Should only call embed once
        expect(mockCreate).toHaveBeenCalledTimes(1);
      });
    });
  });
});
