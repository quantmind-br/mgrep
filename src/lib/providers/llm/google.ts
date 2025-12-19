import type {
  ChatMessage,
  CompletionResult,
  LLMClient,
  LLMConfig,
} from "../types.js";

interface GoogleContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

/**
 * Google Gemini LLM client
 */
export class GoogleLLM implements LLMClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private temperature: number;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || "";
    this.model = config.model || "gemini-2.0-flash";
    this.baseUrl =
      config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  async chat(messages: ChatMessage[]): Promise<CompletionResult> {
    // Convert messages to Google format
    // Google requires alternating user/model roles, and system prompts go in systemInstruction
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const contents: GoogleContent[] = otherMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: systemMessage
              ? { parts: [{ text: systemMessage.content }] }
              : undefined,
            generationConfig: {
              temperature: this.temperature,
              maxOutputTokens: this.maxTokens,
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google API error: ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as GoogleResponse;
      const text =
        data.candidates[0]?.content?.parts?.map((p) => p.text).join("") || "";

      return {
        content: text,
        tokenCount: data.usageMetadata
          ? {
              prompt: data.usageMetadata.promptTokenCount,
              completion: data.usageMetadata.candidatesTokenCount,
            }
          : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
