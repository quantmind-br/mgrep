import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLLM } from "./anthropic.js";
import { GoogleLLM } from "./google.js";
import { createLLMClient } from "./index.js";
import { OpenAILLM } from "./openai.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("llm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createLLMClient", () => {
    it("should create OpenAI client for openai provider", () => {
      const client = createLLMClient({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "test-api-key",
        temperature: 0.7,
        maxTokens: 4096,
        timeoutMs: 60000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
    });

    it("should create OpenAI client for ollama provider", () => {
      const client = createLLMClient({
        provider: "ollama",
        model: "llama3",
        baseUrl: "http://localhost:11434/v1",
        temperature: 0.7,
        maxTokens: 4096,
        timeoutMs: 60000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
    });

    it("should create Google client for google provider", () => {
      const client = createLLMClient({
        provider: "google",
        model: "gemini-2.0-flash",
        temperature: 0.7,
        maxTokens: 4096,
        timeoutMs: 60000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
    });

    it("should create Anthropic client for anthropic provider", () => {
      const client = createLLMClient({
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.7,
        maxTokens: 4096,
        timeoutMs: 60000,
        maxRetries: 3,
      });

      expect(client).toBeDefined();
    });

    it("should throw error for unknown provider", () => {
      expect(() =>
        createLLMClient({
          provider: "unknown" as "openai",
          model: "some-model",
          temperature: 0.7,
          maxTokens: 4096,
          timeoutMs: 60000,
          maxRetries: 3,
        }),
      ).toThrow("Unknown LLM provider");
    });
  });

  describe("AnthropicLLM", () => {
    describe("constructor", () => {
      it("should use provided config values", () => {
        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          apiKey: "test-key",
          baseUrl: "https://custom.api.com",
          maxTokens: 2048,
          temperature: 0.5,
          timeoutMs: 30000,
          maxRetries: 2,
        });

        expect(client).toBeDefined();
      });

      it("should use default values when not provided", () => {
        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        expect(client).toBeDefined();
      });

      it("should use ANTHROPIC_API_KEY from env if not provided", () => {
        const originalEnv = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = "env-api-key";

        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        expect(client).toBeDefined();
        process.env.ANTHROPIC_API_KEY = originalEnv;
      });
    });

    describe("chat", () => {
      it("should send a chat request and return completion result", async () => {
        const mockResponse = {
          content: [{ text: "Hello! How can I help you?" }],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.content).toBe("Hello! How can I help you?");
        expect(result.tokenCount).toEqual({
          prompt: 10,
          completion: 20,
        });
      });

      it("should handle system messages separately", async () => {
        const mockResponse = {
          content: [{ text: "Response" }],
          usage: { input_tokens: 5, output_tokens: 10 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        await client.chat([
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello" },
        ]);

        expect(mockFetch).toHaveBeenCalled();
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.system).toBe("You are a helpful assistant");
        expect(callBody.messages).toHaveLength(1);
      });

      it("should throw error on API failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve("Rate limit exceeded"),
        });

        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        await expect(
          client.chat([{ role: "user", content: "Hello" }]),
        ).rejects.toThrow("Anthropic API error: Rate limit exceeded");
      });

      it("should abort request on timeout", async () => {
        mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

        const client = new AnthropicLLM({
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          apiKey: "test-key",
          timeoutMs: 1000,
          maxRetries: 3,
        });

        client.chat([{ role: "user", content: "Hello" }]);

        // Advance timers to trigger the abort
        vi.advanceTimersByTime(1000);

        // The fetch should have been called with an AbortSignal
        expect(mockFetch).toHaveBeenCalled();
        const signal = mockFetch.mock.calls[0][1].signal;
        expect(signal).toBeInstanceOf(AbortSignal);
      });
    });
  });

  describe("GoogleLLM", () => {
    describe("constructor", () => {
      it("should use provided config values", () => {
        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          baseUrl: "https://custom.api.com",
          maxTokens: 2048,
          temperature: 0.5,
          timeoutMs: 30000,
          maxRetries: 2,
        });

        expect(client).toBeDefined();
      });

      it("should use default values when not provided", () => {
        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        expect(client).toBeDefined();
      });

      it("should use GOOGLE_API_KEY from env if not provided", () => {
        const originalEnv = process.env.GOOGLE_API_KEY;
        process.env.GOOGLE_API_KEY = "env-api-key";

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        expect(client).toBeDefined();
        process.env.GOOGLE_API_KEY = originalEnv;
      });
    });

    describe("chat", () => {
      it("should send a chat request and return completion result", async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [{ text: "Hello from Gemini!" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.content).toBe("Hello from Gemini!");
        expect(result.tokenCount).toEqual({
          prompt: 10,
          completion: 20,
        });
      });

      it("should handle system messages with systemInstruction", async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [{ text: "Response" }],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        await client.chat([
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello" },
        ]);

        expect(mockFetch).toHaveBeenCalled();
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.systemInstruction).toEqual({
          parts: [{ text: "You are a helpful assistant" }],
        });
        expect(callBody.contents).toHaveLength(1);
      });

      it("should convert assistant role to model role", async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [{ text: "Response" }],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        await client.chat([
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ]);

        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.contents[0].role).toBe("user");
        expect(callBody.contents[1].role).toBe("model");
        expect(callBody.contents[2].role).toBe("user");
      });

      it("should return empty tokenCount when usageMetadata is missing", async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [{ text: "Response" }],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.tokenCount).toBeUndefined();
      });

      it("should throw error on API failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          statusText: "Bad Request",
          text: () => Promise.resolve("Invalid API key"),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        await expect(
          client.chat([{ role: "user", content: "Hello" }]),
        ).rejects.toThrow("Google API error: Bad Request - Invalid API key");
      });

      it("should handle empty candidates response", async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.content).toBe("");
      });

      it("should join multiple parts into one response", async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [{ text: "Part 1 " }, { text: "Part 2" }],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const client = new GoogleLLM({
          provider: "google",
          model: "gemini-2.0-flash",
          apiKey: "test-key",
          maxRetries: 3,
          timeoutMs: 60000,
        });

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.content).toBe("Part 1 Part 2");
      });
    });
  });

  describe("OpenAILLM", () => {
    describe("constructor", () => {
      it("should use provided config values", () => {
        const mockClient = {
          chat: {
            completions: {
              create: vi.fn(),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxTokens: 2048,
            temperature: 0.5,
            timeoutMs: 30000,
            maxRetries: 2,
          },
          mockClient as never,
        );

        expect(client).toBeDefined();
      });

      it("should use default values when not provided", () => {
        const mockClient = {
          chat: {
            completions: {
              create: vi.fn(),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        expect(client).toBeDefined();
      });
    });

    describe("chat", () => {
      it("should send a chat request and return completion result", async () => {
        const mockResponse = {
          choices: [
            {
              message: { content: "Hello from OpenAI!" },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
          },
        };

        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue(mockResponse),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.content).toBe("Hello from OpenAI!");
        expect(result.tokenCount).toEqual({
          prompt: 10,
          completion: 20,
        });
      });

      it("should handle missing usage in response", async () => {
        const mockResponse = {
          choices: [
            {
              message: { content: "Response" },
            },
          ],
        };

        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue(mockResponse),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.tokenCount).toBeUndefined();
      });

      it("should handle null content in response", async () => {
        const mockResponse = {
          choices: [
            {
              message: { content: null },
            },
          ],
        };

        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue(mockResponse),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        const result = await client.chat([{ role: "user", content: "Hello" }]);

        expect(result.content).toBe("");
      });

      it("should pass correct parameters to OpenAI client", async () => {
        const mockCreate = vi.fn().mockResolvedValue({
          choices: [{ message: { content: "Response" } }],
        });

        const mockClient = {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxTokens: 1024,
            temperature: 0.3,
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        await client.chat([
          { role: "system", content: "You are a helper" },
          { role: "user", content: "Hello" },
        ]);

        expect(mockCreate).toHaveBeenCalledWith({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helper" },
            { role: "user", content: "Hello" },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        });
      });
    });

    describe("chatStream", () => {
      it("should stream chat responses", async () => {
        async function* mockStream() {
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: { content: " world" } }] };
          yield { choices: [{ delta: { content: "!" } }] };
        }

        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue(mockStream()),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        const chunks: string[] = [];
        for await (const chunk of client.chatStream([
          { role: "user", content: "Hello" },
        ])) {
          chunks.push(chunk);
        }

        expect(chunks).toEqual(["Hello", " world", "!"]);
      });

      it("should skip chunks without content", async () => {
        async function* mockStream() {
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: {} }] };
          yield { choices: [{ delta: { content: " world" } }] };
        }

        const mockClient = {
          chat: {
            completions: {
              create: vi.fn().mockResolvedValue(mockStream()),
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        const chunks: string[] = [];
        for await (const chunk of client.chatStream([
          { role: "user", content: "Hello" },
        ])) {
          chunks.push(chunk);
        }

        expect(chunks).toEqual(["Hello", " world"]);
      });

      it("should pass stream parameter to OpenAI client", async () => {
        async function* mockStream() {
          yield { choices: [{ delta: { content: "Test" } }] };
        }

        const mockCreate = vi.fn().mockResolvedValue(mockStream());

        const mockClient = {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
        };

        const client = new OpenAILLM(
          {
            provider: "openai",
            model: "gpt-4o-mini",
            maxRetries: 3,
            timeoutMs: 60000,
          },
          mockClient as never,
        );

        // Consume the stream
        for await (const _chunk of client.chatStream([
          { role: "user", content: "Hello" },
        ])) {
          // Consume
        }

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            stream: true,
          }),
        );
      });
    });
  });
});
