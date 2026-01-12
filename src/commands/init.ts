import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { Command } from "commander";

const CONFIG_DIR = path.join(os.homedir(), ".config", "mgrep");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");

type ProviderDefaults = {
  embeddingModel: string;
  embeddingProvider: "openai" | "google" | "anthropic" | "ollama";
  llmModel: string;
};

const PROVIDER_DEFAULTS: Record<
  ProviderDefaults["embeddingProvider"],
  ProviderDefaults
> = {
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
  });
