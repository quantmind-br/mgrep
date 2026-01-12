import * as p from "@clack/prompts";
import chalk from "chalk";
import {
  DEFAULT_CONFIG,
  type EmbeddingsConfig,
  type IgnoreConfig,
  type LLMConfig,
  type MgrepConfig,
  type ProviderType,
  type QdrantConfig,
  type SyncConfig,
  type TavilyConfig,
} from "./config.js";
import {
  type ConfigTarget,
  getConfigLocations,
  getConfigPath,
  readConfigFile,
  writeConfigFile,
} from "./config-writer.js";

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

export interface TUIState {
  target: ConfigTarget;
  cwd: string;
  config: Partial<MgrepConfig>;
  hasChanges: boolean;
}

export type MenuAction =
  | "embeddings"
  | "llm"
  | "qdrant"
  | "sync"
  | "tavily"
  | "ignore"
  | "general"
  | "view"
  | "save"
  | "exit";

const PROVIDER_OPTIONS = [
  {
    value: "openai" as const,
    label: "OpenAI",
    hint: "GPT-4, text-embedding-3",
  },
  { value: "google" as const, label: "Google", hint: "Gemini models" },
  { value: "anthropic" as const, label: "Anthropic", hint: "Claude models" },
  { value: "ollama" as const, label: "Ollama", hint: "Local models" },
];

const SEARCH_DEPTH_OPTIONS = [
  { value: "basic" as const, label: "Basic" },
  { value: "advanced" as const, label: "Advanced" },
];

export async function selectConfigTarget(
  cwd: string,
): Promise<ConfigTarget | null> {
  const locations = getConfigLocations(cwd);

  const globalLabel = locations.global.exists
    ? `Global (${locations.global.path}) ${chalk.green("[exists]")}`
    : `Global (${locations.global.path})`;

  const localLabel = locations.local.exists
    ? `Local (${locations.local.path}) ${chalk.green("[exists]")}`
    : `Local (${locations.local.path})`;

  const result = await p.select({
    message: "Which configuration do you want to edit?",
    options: [
      { value: "global" as ConfigTarget, label: globalLabel },
      { value: "local" as ConfigTarget, label: localLabel },
    ],
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as ConfigTarget;
}

export function initTUIState(target: ConfigTarget, cwd: string): TUIState {
  const configPath = getConfigPath(target, cwd);
  let existingConfig: Partial<MgrepConfig> | null = null;

  try {
    existingConfig = readConfigFile(configPath);
  } catch {
    existingConfig = null;
  }

  return {
    target,
    cwd,
    config: existingConfig ?? {},
    hasChanges: false,
  };
}

export async function mainMenuLoop(state: TUIState): Promise<void> {
  while (true) {
    const action = await showMainMenu(state);

    if (action === null || action === "exit") {
      if (state.hasChanges) {
        const save = await p.confirm({
          message: "You have unsaved changes. Save before exiting?",
          initialValue: true,
        });

        if (p.isCancel(save)) {
          continue;
        }

        if (save) {
          await saveConfig(state);
        }
      }
      break;
    }

    if (action === "save") {
      await saveConfig(state);
      break;
    }

    if (action === "view") {
      viewCurrentConfig(state);
      continue;
    }

    await handleSectionEdit(state, action);
  }
}

async function showMainMenu(state: TUIState): Promise<MenuAction | null> {
  const targetLabel = state.target === "global" ? "Global" : "Local";
  const changesLabel = state.hasChanges ? chalk.yellow(" [modified]") : "";

  const result = await p.select({
    message: `${targetLabel} Configuration${changesLabel}`,
    options: [
      {
        value: "embeddings" as MenuAction,
        label: "Embeddings",
        hint: "Provider, model, dimensions",
      },
      {
        value: "llm" as MenuAction,
        label: "LLM",
        hint: "Provider, model, temperature",
      },
      {
        value: "qdrant" as MenuAction,
        label: "Qdrant",
        hint: "URL, API key, collection prefix",
      },
      {
        value: "sync" as MenuAction,
        label: "Sync",
        hint: "Concurrency settings",
      },
      {
        value: "tavily" as MenuAction,
        label: "Tavily",
        hint: "Web search configuration",
      },
      {
        value: "ignore" as MenuAction,
        label: "Ignore",
        hint: "File filtering rules",
      },
      {
        value: "general" as MenuAction,
        label: "General",
        hint: "Max file size",
      },
      {
        value: "view" as MenuAction,
        label: "View Current Config",
        hint: "Display all settings",
      },
      {
        value: "save" as MenuAction,
        label: "Save & Exit",
        hint: "Write changes to file",
      },
      {
        value: "exit" as MenuAction,
        label: "Exit",
        hint: state.hasChanges ? "Discard changes" : undefined,
      },
    ],
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as MenuAction;
}

async function handleSectionEdit(
  state: TUIState,
  action: MenuAction,
): Promise<void> {
  switch (action) {
    case "embeddings":
      await editEmbeddings(state);
      break;
    case "llm":
      await editLLM(state);
      break;
    case "qdrant":
      await editQdrant(state);
      break;
    case "sync":
      await editSync(state);
      break;
    case "tavily":
      await editTavily(state);
      break;
    case "ignore":
      await editIgnore(state);
      break;
    case "general":
      await editGeneral(state);
      break;
  }
}

export function viewCurrentConfig(state: TUIState): void {
  const merged = getMergedConfig(state);
  const lines: string[] = [];

  lines.push(chalk.bold("\n=== Current Configuration ===\n"));
  lines.push(
    chalk.cyan("Source: ") + (state.target === "global" ? "Global" : "Local"),
  );
  lines.push("");

  lines.push(chalk.bold("General:"));
  lines.push(`  maxFileSize: ${formatBytes(merged.maxFileSize)}`);
  lines.push("");

  lines.push(chalk.bold("Embeddings:"));
  lines.push(`  provider: ${merged.embeddings.provider}`);
  lines.push(`  model: ${merged.embeddings.model}`);
  if (merged.embeddings.baseUrl)
    lines.push(`  baseUrl: ${merged.embeddings.baseUrl}`);
  if (merged.embeddings.dimensions)
    lines.push(`  dimensions: ${merged.embeddings.dimensions}`);
  lines.push(`  batchSize: ${merged.embeddings.batchSize}`);
  lines.push(`  timeoutMs: ${merged.embeddings.timeoutMs}`);
  lines.push(`  maxRetries: ${merged.embeddings.maxRetries}`);
  lines.push("");

  lines.push(chalk.bold("LLM:"));
  lines.push(`  provider: ${merged.llm.provider}`);
  lines.push(`  model: ${merged.llm.model}`);
  if (merged.llm.baseUrl) lines.push(`  baseUrl: ${merged.llm.baseUrl}`);
  lines.push(`  temperature: ${merged.llm.temperature}`);
  lines.push(`  maxTokens: ${merged.llm.maxTokens}`);
  lines.push(`  timeoutMs: ${merged.llm.timeoutMs}`);
  lines.push(`  maxRetries: ${merged.llm.maxRetries}`);
  lines.push("");

  lines.push(chalk.bold("Qdrant:"));
  lines.push(`  url: ${merged.qdrant.url}`);
  if (merged.qdrant.apiKey)
    lines.push(`  apiKey: ${maskSecret(merged.qdrant.apiKey)}`);
  lines.push(`  collectionPrefix: ${merged.qdrant.collectionPrefix}`);
  lines.push("");

  lines.push(chalk.bold("Sync:"));
  lines.push(`  concurrency: ${merged.sync.concurrency}`);
  lines.push("");

  lines.push(chalk.bold("Tavily:"));
  if (merged.tavily.apiKey)
    lines.push(`  apiKey: ${maskSecret(merged.tavily.apiKey)}`);
  lines.push(`  maxResults: ${merged.tavily.maxResults}`);
  lines.push(`  searchDepth: ${merged.tavily.searchDepth}`);
  lines.push(`  includeImages: ${merged.tavily.includeImages}`);
  lines.push(`  includeRawContent: ${merged.tavily.includeRawContent}`);
  lines.push("");

  lines.push(chalk.bold("Ignore:"));
  lines.push(`  categories.vendor: ${merged.ignore.categories.vendor}`);
  lines.push(`  categories.generated: ${merged.ignore.categories.generated}`);
  lines.push(`  categories.binary: ${merged.ignore.categories.binary}`);
  lines.push(`  categories.config: ${merged.ignore.categories.config}`);
  lines.push(`  detectGenerated: ${merged.ignore.detectGenerated}`);
  if (merged.ignore.additional.length > 0) {
    lines.push(`  additional: ${merged.ignore.additional.join(", ")}`);
  }
  if (merged.ignore.exceptions.length > 0) {
    lines.push(`  exceptions: ${merged.ignore.exceptions.join(", ")}`);
  }

  p.note(lines.join("\n"), "Configuration");
}

export async function saveConfig(state: TUIState): Promise<void> {
  const configPath = getConfigPath(state.target, state.cwd);

  const spinner = p.spinner();
  spinner.start("Saving configuration...");

  try {
    writeConfigFile(configPath, state.config);
    spinner.stop(`Configuration saved to ${configPath}`);
    state.hasChanges = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.stop(chalk.red(`Failed to save: ${message}`));
  }
}

function getMergedConfig(state: TUIState): MgrepConfig {
  return {
    maxFileSize: state.config.maxFileSize ?? DEFAULT_CONFIG.maxFileSize,
    embeddings: { ...DEFAULT_CONFIG.embeddings, ...state.config.embeddings },
    llm: { ...DEFAULT_CONFIG.llm, ...state.config.llm },
    qdrant: { ...DEFAULT_CONFIG.qdrant, ...state.config.qdrant },
    sync: { ...DEFAULT_CONFIG.sync, ...state.config.sync },
    tavily: { ...DEFAULT_CONFIG.tavily, ...state.config.tavily },
    ignore: {
      categories: {
        ...DEFAULT_CONFIG.ignore.categories,
        ...state.config.ignore?.categories,
      },
      additional:
        state.config.ignore?.additional ?? DEFAULT_CONFIG.ignore.additional,
      exceptions:
        state.config.ignore?.exceptions ?? DEFAULT_CONFIG.ignore.exceptions,
      detectGenerated:
        state.config.ignore?.detectGenerated ??
        DEFAULT_CONFIG.ignore.detectGenerated,
    },
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "****";
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

interface EditFieldOptions {
  type: "text" | "number" | "boolean" | "password";
  validate?: (value: string) => string | undefined;
  placeholder?: string;
}

async function editField<T extends string | number | boolean>(
  label: string,
  currentValue: T | undefined,
  defaultValue: T,
  options: EditFieldOptions,
): Promise<{ value: T | undefined; cancelled: boolean }> {
  const displayCurrent =
    currentValue !== undefined
      ? String(currentValue)
      : `default: ${defaultValue}`;

  if (options.type === "boolean") {
    const result = await p.confirm({
      message: `${label} (current: ${displayCurrent})`,
      initialValue: (currentValue ?? defaultValue) as boolean,
    });
    if (p.isCancel(result)) return { value: undefined, cancelled: true };
    return { value: result as T, cancelled: false };
  }

  if (options.type === "password") {
    const result = await p.password({
      message: `${label} (current: ${currentValue ? maskSecret(String(currentValue)) : "not set"})`,
      validate: options.validate,
    });
    if (p.isCancel(result)) return { value: undefined, cancelled: true };
    if (result === undefined) return { value: undefined, cancelled: false };
    const trimmed = result.trim();
    return { value: (trimmed || undefined) as T | undefined, cancelled: false };
  }

  const result = await p.text({
    message: `${label} (current: ${displayCurrent})`,
    initialValue: currentValue !== undefined ? String(currentValue) : "",
    placeholder: options.placeholder ?? String(defaultValue),
    validate: options.validate,
  });

  if (p.isCancel(result)) return { value: undefined, cancelled: true };
  if (result === undefined) return { value: undefined, cancelled: false };

  const trimmed = result.trim();
  if (!trimmed) return { value: undefined, cancelled: false };

  if (options.type === "number") {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return { value: undefined, cancelled: false };
    return { value: parsed as T, cancelled: false };
  }

  return { value: trimmed as T, cancelled: false };
}

async function editEmbeddings(state: TUIState): Promise<void> {
  const current: Partial<EmbeddingsConfig> = state.config.embeddings ?? {};
  const defaults = DEFAULT_CONFIG.embeddings;

  p.note("Configure embeddings provider settings", "Embeddings");

  const providerResult = await p.select({
    message: `Provider (current: ${current.provider ?? defaults.provider})`,
    options: PROVIDER_OPTIONS,
    initialValue: current.provider ?? defaults.provider,
  });
  if (p.isCancel(providerResult)) return;
  const provider = providerResult as ProviderType;

  const modelResult = await editField<string>(
    "Model",
    current.model,
    defaults.model,
    {
      type: "text",
      placeholder: defaults.model,
    },
  );
  if (modelResult.cancelled) return;
  const model = modelResult.value;

  const ollamaBaseUrl =
    provider === "ollama" ? OLLAMA_DEFAULT_BASE_URL : undefined;
  const currentBaseUrl =
    current.baseUrl ?? (provider === "ollama" ? OLLAMA_DEFAULT_BASE_URL : "");

  if (provider === "ollama" && !current.baseUrl) {
    p.note(`Using default Ollama URL: ${OLLAMA_DEFAULT_BASE_URL}`, "Ollama");
  }

  const baseUrlResult = await editField<string>(
    "Base URL",
    currentBaseUrl || undefined,
    ollamaBaseUrl ?? "",
    {
      type: "text",
      placeholder:
        provider === "ollama"
          ? OLLAMA_DEFAULT_BASE_URL
          : "Leave empty for default",
    },
  );
  if (baseUrlResult.cancelled) return;
  const baseUrl = baseUrlResult.value;

  const apiKeyResult = await editField<string>("API Key", current.apiKey, "", {
    type: "password",
  });
  if (apiKeyResult.cancelled) return;
  const apiKey = apiKeyResult.value;

  const dimensionsResult = await editField<number>(
    "Dimensions",
    current.dimensions,
    0,
    {
      type: "number",
      placeholder: "Leave empty to use model default",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
  );
  if (dimensionsResult.cancelled) return;
  const dimensions = dimensionsResult.value;

  const batchSizeResult = await editField<number>(
    "Batch Size",
    current.batchSize,
    defaults.batchSize,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
  );
  if (batchSizeResult.cancelled) return;
  const batchSize = batchSizeResult.value;

  const timeoutMsResult = await editField<number>(
    "Timeout (ms)",
    current.timeoutMs,
    defaults.timeoutMs,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
  );
  if (timeoutMsResult.cancelled) return;
  const timeoutMs = timeoutMsResult.value;

  const maxRetriesResult = await editField<number>(
    "Max Retries",
    current.maxRetries,
    defaults.maxRetries,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) return "Must be zero or positive";
        return undefined;
      },
    },
  );
  if (maxRetriesResult.cancelled) return;
  const maxRetries = maxRetriesResult.value;

  const updated: Partial<EmbeddingsConfig> = {};
  updated.provider = provider;
  if (model && model !== defaults.model) updated.model = model;
  if (baseUrl) {
    updated.baseUrl = baseUrl;
  } else if (provider === "ollama") {
    updated.baseUrl = OLLAMA_DEFAULT_BASE_URL;
  }
  if (apiKey) updated.apiKey = apiKey;
  if (dimensions && dimensions > 0) updated.dimensions = dimensions;
  if (batchSize && batchSize !== defaults.batchSize)
    updated.batchSize = batchSize;
  if (timeoutMs && timeoutMs !== defaults.timeoutMs)
    updated.timeoutMs = timeoutMs;
  if (maxRetries !== undefined && maxRetries !== defaults.maxRetries)
    updated.maxRetries = maxRetries;

  if (Object.keys(updated).length > 0) {
    state.config.embeddings = {
      ...state.config.embeddings,
      ...updated,
    } as EmbeddingsConfig;
    state.hasChanges = true;
    p.note("Embeddings settings updated", "Success");
  }
}

async function editLLM(state: TUIState): Promise<void> {
  const current: Partial<LLMConfig> = state.config.llm ?? {};
  const defaults = DEFAULT_CONFIG.llm;

  p.note("Configure LLM provider settings", "LLM");

  const providerResult = await p.select({
    message: `Provider (current: ${current.provider ?? defaults.provider})`,
    options: PROVIDER_OPTIONS,
    initialValue: current.provider ?? defaults.provider,
  });
  if (p.isCancel(providerResult)) return;
  const provider = providerResult as ProviderType;

  const modelResult = await editField<string>(
    "Model",
    current.model,
    defaults.model,
    {
      type: "text",
      placeholder: defaults.model,
    },
  );
  if (modelResult.cancelled) return;
  const model = modelResult.value;

  const ollamaBaseUrl =
    provider === "ollama" ? OLLAMA_DEFAULT_BASE_URL : undefined;
  const currentBaseUrl =
    current.baseUrl ?? (provider === "ollama" ? OLLAMA_DEFAULT_BASE_URL : "");

  if (provider === "ollama" && !current.baseUrl) {
    p.note(`Using default Ollama URL: ${OLLAMA_DEFAULT_BASE_URL}`, "Ollama");
  }

  const baseUrlResult = await editField<string>(
    "Base URL",
    currentBaseUrl || undefined,
    ollamaBaseUrl ?? "",
    {
      type: "text",
      placeholder:
        provider === "ollama"
          ? OLLAMA_DEFAULT_BASE_URL
          : "Leave empty for default",
    },
  );
  if (baseUrlResult.cancelled) return;
  const baseUrl = baseUrlResult.value;

  const apiKeyResult = await editField<string>("API Key", current.apiKey, "", {
    type: "password",
  });
  if (apiKeyResult.cancelled) return;
  const apiKey = apiKeyResult.value;

  const temperatureResult = await editField<number>(
    "Temperature",
    current.temperature,
    defaults.temperature,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0 || n > 2) return "Must be between 0 and 2";
        return undefined;
      },
    },
  );
  if (temperatureResult.cancelled) return;
  const temperature = temperatureResult.value;

  const maxTokensResult = await editField<number>(
    "Max Tokens",
    current.maxTokens,
    defaults.maxTokens,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
  );
  if (maxTokensResult.cancelled) return;
  const maxTokens = maxTokensResult.value;

  const timeoutMsResult = await editField<number>(
    "Timeout (ms)",
    current.timeoutMs,
    defaults.timeoutMs,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
  );
  if (timeoutMsResult.cancelled) return;
  const timeoutMs = timeoutMsResult.value;

  const maxRetriesResult = await editField<number>(
    "Max Retries",
    current.maxRetries,
    defaults.maxRetries,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) return "Must be zero or positive";
        return undefined;
      },
    },
  );
  if (maxRetriesResult.cancelled) return;
  const maxRetries = maxRetriesResult.value;

  const updated: Partial<LLMConfig> = {};
  updated.provider = provider;
  if (model && model !== defaults.model) updated.model = model;
  if (baseUrl) {
    updated.baseUrl = baseUrl;
  } else if (provider === "ollama") {
    updated.baseUrl = OLLAMA_DEFAULT_BASE_URL;
  }
  if (apiKey) updated.apiKey = apiKey;
  if (temperature !== undefined && temperature !== defaults.temperature)
    updated.temperature = temperature;
  if (maxTokens && maxTokens !== defaults.maxTokens)
    updated.maxTokens = maxTokens;
  if (timeoutMs && timeoutMs !== defaults.timeoutMs)
    updated.timeoutMs = timeoutMs;
  if (maxRetries !== undefined && maxRetries !== defaults.maxRetries)
    updated.maxRetries = maxRetries;

  if (Object.keys(updated).length > 0) {
    state.config.llm = { ...state.config.llm, ...updated } as LLMConfig;
    state.hasChanges = true;
    p.note("LLM settings updated", "Success");
  }
}

async function editQdrant(state: TUIState): Promise<void> {
  const current: Partial<QdrantConfig> = state.config.qdrant ?? {};
  const defaults = DEFAULT_CONFIG.qdrant;

  p.note("Configure Qdrant vector database settings", "Qdrant");

  const urlResult = await editField<string>("URL", current.url, defaults.url, {
    type: "text",
    placeholder: defaults.url,
    validate: (v) => {
      if (!v.trim()) return undefined;
      try {
        new URL(v);
        return undefined;
      } catch {
        return "Must be a valid URL";
      }
    },
  });
  if (urlResult.cancelled) return;
  const url = urlResult.value;

  const apiKeyResult = await editField<string>("API Key", current.apiKey, "", {
    type: "password",
  });
  if (apiKeyResult.cancelled) return;
  const apiKey = apiKeyResult.value;

  const collectionPrefixResult = await editField<string>(
    "Collection Prefix",
    current.collectionPrefix,
    defaults.collectionPrefix,
    {
      type: "text",
      placeholder: defaults.collectionPrefix,
    },
  );
  if (collectionPrefixResult.cancelled) return;
  const collectionPrefix = collectionPrefixResult.value;

  const updated: Partial<QdrantConfig> = {};
  if (url && url !== defaults.url) updated.url = url;
  if (apiKey) updated.apiKey = apiKey;
  if (collectionPrefix && collectionPrefix !== defaults.collectionPrefix)
    updated.collectionPrefix = collectionPrefix;

  if (Object.keys(updated).length > 0) {
    state.config.qdrant = {
      ...state.config.qdrant,
      ...updated,
    } as QdrantConfig;
    state.hasChanges = true;
    p.note("Qdrant settings updated", "Success");
  }
}

async function editSync(state: TUIState): Promise<void> {
  const current: Partial<SyncConfig> = state.config.sync ?? {};
  const defaults = DEFAULT_CONFIG.sync;

  p.note("Configure sync settings", "Sync");

  const concurrencyResult = await editField<number>(
    "Concurrency",
    current.concurrency,
    defaults.concurrency,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0 || !Number.isInteger(n))
          return "Must be a positive integer";
        return undefined;
      },
    },
  );
  if (concurrencyResult.cancelled) return;
  const concurrency = concurrencyResult.value;

  const updated: Partial<SyncConfig> = {};
  if (concurrency && concurrency !== defaults.concurrency)
    updated.concurrency = concurrency;

  if (Object.keys(updated).length > 0) {
    state.config.sync = { ...state.config.sync, ...updated } as SyncConfig;
    state.hasChanges = true;
    p.note("Sync settings updated", "Success");
  }
}

async function editTavily(state: TUIState): Promise<void> {
  const current: Partial<TavilyConfig> = state.config.tavily ?? {};
  const defaults = DEFAULT_CONFIG.tavily;

  p.note("Configure Tavily web search settings", "Tavily");

  const apiKeyResult = await editField<string>("API Key", current.apiKey, "", {
    type: "password",
  });
  if (apiKeyResult.cancelled) return;
  const apiKey = apiKeyResult.value;

  const maxResultsResult = await editField<number>(
    "Max Results",
    current.maxResults,
    defaults.maxResults,
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0 || !Number.isInteger(n))
          return "Must be a positive integer";
        return undefined;
      },
    },
  );
  if (maxResultsResult.cancelled) return;
  const maxResults = maxResultsResult.value;

  const searchDepthResult = await p.select({
    message: `Search Depth (current: ${current.searchDepth ?? defaults.searchDepth})`,
    options: SEARCH_DEPTH_OPTIONS,
    initialValue: current.searchDepth ?? defaults.searchDepth,
  });
  if (p.isCancel(searchDepthResult)) return;
  const searchDepth = searchDepthResult as "basic" | "advanced";

  const includeImagesResult = await editField<boolean>(
    "Include Images",
    current.includeImages,
    defaults.includeImages,
    {
      type: "boolean",
    },
  );
  if (includeImagesResult.cancelled) return;
  const includeImages = includeImagesResult.value;

  const includeRawContentResult = await editField<boolean>(
    "Include Raw Content",
    current.includeRawContent,
    defaults.includeRawContent,
    {
      type: "boolean",
    },
  );
  if (includeRawContentResult.cancelled) return;
  const includeRawContent = includeRawContentResult.value;

  const updated: Partial<TavilyConfig> = {};
  if (apiKey) updated.apiKey = apiKey;
  if (maxResults && maxResults !== defaults.maxResults)
    updated.maxResults = maxResults;
  if (searchDepth !== defaults.searchDepth) updated.searchDepth = searchDepth;
  if (includeImages !== undefined && includeImages !== defaults.includeImages)
    updated.includeImages = includeImages;
  if (
    includeRawContent !== undefined &&
    includeRawContent !== defaults.includeRawContent
  )
    updated.includeRawContent = includeRawContent;

  if (Object.keys(updated).length > 0) {
    state.config.tavily = {
      ...state.config.tavily,
      ...updated,
    } as TavilyConfig;
    state.hasChanges = true;
    p.note("Tavily settings updated", "Success");
  }
}

async function editIgnore(state: TUIState): Promise<void> {
  const current: Partial<IgnoreConfig> = state.config.ignore ?? {};
  const defaults = DEFAULT_CONFIG.ignore;

  p.note("Configure file ignore rules", "Ignore");

  const vendorResult = await editField<boolean>(
    "Ignore vendor directories (node_modules, vendor, etc.)",
    current.categories?.vendor,
    defaults.categories.vendor,
    { type: "boolean" },
  );
  if (vendorResult.cancelled) return;
  const vendor = vendorResult.value;

  const generatedResult = await editField<boolean>(
    "Ignore generated files (dist, build, etc.)",
    current.categories?.generated,
    defaults.categories.generated,
    { type: "boolean" },
  );
  if (generatedResult.cancelled) return;
  const generated = generatedResult.value;

  const binaryResult = await editField<boolean>(
    "Ignore binary files",
    current.categories?.binary,
    defaults.categories.binary,
    { type: "boolean" },
  );
  if (binaryResult.cancelled) return;
  const binary = binaryResult.value;

  const configResult = await editField<boolean>(
    "Ignore config files (.github, Dockerfile, etc.)",
    current.categories?.config,
    defaults.categories.config,
    { type: "boolean" },
  );
  if (configResult.cancelled) return;
  const config = configResult.value;

  const detectGeneratedResult = await editField<boolean>(
    "Detect generated files automatically",
    current.detectGenerated,
    defaults.detectGenerated,
    { type: "boolean" },
  );
  if (detectGeneratedResult.cancelled) return;
  const detectGenerated = detectGeneratedResult.value;

  const additionalStrResult = await editField<string>(
    "Additional ignore patterns (comma-separated)",
    current.additional?.join(", "),
    "",
    { type: "text", placeholder: "e.g., internal/, *.log" },
  );
  if (additionalStrResult.cancelled) return;
  const additionalStr = additionalStrResult.value;

  const exceptionsStrResult = await editField<string>(
    "Exceptions (comma-separated)",
    current.exceptions?.join(", "),
    "",
    { type: "text", placeholder: "e.g., !vendor/important/" },
  );
  if (exceptionsStrResult.cancelled) return;
  const exceptionsStr = exceptionsStrResult.value;

  const categories: IgnoreConfig["categories"] = {
    vendor: vendor ?? defaults.categories.vendor,
    generated: generated ?? defaults.categories.generated,
    binary: binary ?? defaults.categories.binary,
    config: config ?? defaults.categories.config,
  };

  const additional = additionalStr
    ? additionalStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const exceptions = exceptionsStr
    ? exceptionsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const updated: Partial<IgnoreConfig> = {
    categories,
    detectGenerated: detectGenerated ?? defaults.detectGenerated,
  };

  if (additional.length > 0) updated.additional = additional;
  if (exceptions.length > 0) updated.exceptions = exceptions;

  state.config.ignore = updated as IgnoreConfig;
  state.hasChanges = true;
  p.note("Ignore settings updated", "Success");
}

async function editGeneral(state: TUIState): Promise<void> {
  const defaults = DEFAULT_CONFIG;

  p.note("Configure general settings", "General");

  const maxFileSizeMBResult = await editField<number>(
    "Max File Size (MB)",
    state.config.maxFileSize
      ? state.config.maxFileSize / (1024 * 1024)
      : undefined,
    defaults.maxFileSize / (1024 * 1024),
    {
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
  );
  if (maxFileSizeMBResult.cancelled) return;
  const maxFileSizeMB = maxFileSizeMBResult.value;

  if (maxFileSizeMB && maxFileSizeMB !== defaults.maxFileSize / (1024 * 1024)) {
    state.config.maxFileSize = maxFileSizeMB * 1024 * 1024;
    state.hasChanges = true;
    p.note("General settings updated", "Success");
  }
}

export async function runConfigTUI(
  cwd: string,
  targetOverride?: ConfigTarget,
): Promise<void> {
  p.intro("mgrep configuration");

  let target: ConfigTarget;
  if (targetOverride) {
    target = targetOverride;
  } else {
    const selected = await selectConfigTarget(cwd);
    if (selected === null) {
      p.cancel("Configuration cancelled.");
      return;
    }
    target = selected;
  }

  const state = initTUIState(target, cwd);
  await mainMenuLoop(state);

  p.outro("Configuration complete!");
}
