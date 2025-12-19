import type OpenAI from "openai";
import type {
  ChatMessage,
  CompletionResult,
  LLMClient,
  LLMConfig,
} from "../types.js";

/**
 * OpenAI-compatible LLM client
 * Works with OpenAI, Ollama, vLLM, LiteLLM, and other OpenAI-compatible APIs
 */
export class OpenAILLM implements LLMClient {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig, client: OpenAI) {
    this.client = client;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  async chat(messages: ChatMessage[]): Promise<CompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || "",
      tokenCount: response.usage
        ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async *chatStream(messages: ChatMessage[]): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
