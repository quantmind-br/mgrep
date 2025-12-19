import type {
  ChatMessage,
  CompletionResult,
  LLMClient,
  LLMConfig,
} from "../types.js";

interface AnthropicResponse {
  content: Array<{ text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic Claude LLM client
 */
export class AnthropicLLM implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private maxTokens: number;
  private temperature: number;
  private timeoutMs: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model = config.model || "claude-3-5-sonnet-20241022";
    this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.7;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  async chat(messages: ChatMessage[]): Promise<CompletionResult> {
    // Separate system message from others (Anthropic API requirement)
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system: systemMessage?.content,
          messages: otherMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${error}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      return {
        content: data.content[0].text,
        tokenCount: {
          prompt: data.usage.input_tokens,
          completion: data.usage.output_tokens,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
