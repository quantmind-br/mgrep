import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { Command } from "commander";

const CONFIG_DIR = path.join(os.homedir(), ".config", "mgrep");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");

type ProviderType = "openai" | "google" | "anthropic" | "ollama";

type ProviderDefaults = {
  embeddingModel: string;
  embeddingProvider: ProviderType;
  llmModel: string;
};

const PROVIDER_DEFAULTS: Record<ProviderType, ProviderDefaults> = {
  openai: {
    embeddingModel: "text-embedding-3-small",
    embeddingProvider: "openai",
    llmModel: "gpt-4o-mini",
  },
  google: {
    embeddingModel: "gemini-embedding-001",
    embeddingProvider: "google",
    llmModel: "gemini-2.0-flash",
  },
  anthropic: {
    embeddingModel: "text-embedding-3-small",
    embeddingProvider: "openai",
    llmModel: "claude-sonnet-4",
  },
  ollama: {
    embeddingModel: "nomic-embed-text",
    embeddingProvider: "ollama",
    llmModel: "llama3.2",
  },
};

function validateApiKeyFormat(provider: ProviderType, apiKey: string): boolean {
  const trimmed = apiKey.trim();
  if (!trimmed) return false;

  switch (provider) {
    case "openai":
      return trimmed.startsWith("sk-");
    case "anthropic":
      return trimmed.startsWith("sk-ant-");
    case "google":
      return trimmed.length > 10;
    case "ollama":
      return true;
    default:
      return false;
  }
}

export const initCommand = new Command("init")
  .description("Initialize mgrep configuration interactively")
  .option("--reconfigure", "Overwrite existing configuration", false)
  .action(async (options) => {
    p.intro("mgrep configuration wizard");

    if (fs.existsSync(CONFIG_FILE) && !options.reconfigure) {
      const overwrite = await p.confirm({
        message: "Configuration already exists. Overwrite?",
        initialValue: false,
      });

      if (p.isCancel(overwrite)) {
        p.cancel("Configuration cancelled.");
        return;
      }

      if (!overwrite) {
        p.cancel("Configuration cancelled.");
        return;
      }
    }

    const provider = await p.select({
      message: "Select your provider:",
      options: [
        { value: "openai", label: "OpenAI", hint: "GPT-4, text-embedding-3" },
        { value: "google", label: "Google", hint: "Gemini models" },
        { value: "anthropic", label: "Anthropic", hint: "Claude models" },
        { value: "ollama", label: "Ollama", hint: "Local models" },
      ],
    });

    if (p.isCancel(provider)) {
      p.cancel("Configuration cancelled.");
      return;
    }

    const defaults = PROVIDER_DEFAULTS[provider];
    p.note(
      `Embeddings: ${defaults.embeddingProvider} (${defaults.embeddingModel})\n` +
        `LLM: ${defaults.llmModel}`,
      "Defaults",
    );

    if (provider === "anthropic") {
      p.note(
        "Anthropic does not provide embeddings. OpenAI will be used for embeddings.",
        "Note",
      );
    }

    if (provider === "ollama") {
      const baseUrl = await p.text({
        message: "Ollama base URL:",
        initialValue: "http://localhost:11434/v1",
      });

      if (p.isCancel(baseUrl)) {
        p.cancel("Configuration cancelled.");
        return;
      }

      p.note(`Using ${baseUrl.trim()}`, "Ollama");
      return;
    }

    const apiKey = await p.password({
      message: `Enter your ${provider} API key:`,
      validate(value) {
        return validateApiKeyFormat(provider, value)
          ? undefined
          : "API key format looks invalid.";
      },
    });

    if (p.isCancel(apiKey)) {
      p.cancel("Configuration cancelled.");
      return;
    }
  });
