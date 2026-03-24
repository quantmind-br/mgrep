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
  | "wizard"
  | "embeddings"
  | "llm"
  | "qdrant"
  | "sync"
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

const EMBEDDINGS_PROVIDER_OPTIONS = [
  {
    value: "openai" as const,
    label: "OpenAI",
    hint: "text-embedding-3-small/large",
  },
  { value: "google" as const, label: "Google", hint: "gemini-embedding-001" },
  {
    value: "ollama" as const,
    label: "Ollama",
    hint: "nomic-embed-text, mxbai-embed-large",
  },
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

    if (action === "wizard") {
      await runSetupWizard(state);
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
        value: "wizard" as MenuAction,
        label: "✦ Quick Setup",
        hint: "Guided setup for Qdrant, embeddings, and LLM",
      },
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
    case "wizard":
      await runSetupWizard(state);
      break;
    case "embeddings":
      await editSection(state, EMBEDDINGS_SECTION);
      break;
    case "llm":
      await editSection(state, LLM_SECTION);
      break;
    case "qdrant":
      await editQdrant(state);
      break;
    case "sync":
      await editSection(state, SYNC_SECTION);
      break;
    case "ignore":
      await editSection(state, IGNORE_SECTION);
      break;
    case "general":
      await editSection(state, GENERAL_SECTION);
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

type FieldType = "text" | "number" | "boolean" | "password" | "select";

interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];
  validate?: (value: string) => string | undefined;
  placeholder?: string;
  transform?: {
    toDisplay?: (value: unknown) => unknown;
    fromDisplay?: (value: unknown) => unknown;
  };
  parseList?: boolean;
}

interface SectionDef {
  key: "embeddings" | "llm" | "sync" | "ignore" | "general";
  title: string;
  fields: FieldDef[];
  successMessage: string;
}

const EMBEDDINGS_SECTION: SectionDef = {
  key: "embeddings",
  title: "Configure embeddings provider settings",
  successMessage: "Embeddings settings updated",
  fields: [
    {
      key: "provider",
      label: "Provider",
      type: "select",
      options: EMBEDDINGS_PROVIDER_OPTIONS,
    },
    {
      key: "model",
      label: "Model",
      type: "text",
      placeholder: DEFAULT_CONFIG.embeddings.model,
    },
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
    },
    {
      key: "dimensions",
      label: "Dimensions",
      type: "number",
      placeholder: "Leave empty to use model default",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
    {
      key: "batchSize",
      label: "Batch Size",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
    {
      key: "timeoutMs",
      label: "Timeout (ms)",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
    {
      key: "maxRetries",
      label: "Max Retries",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) return "Must be zero or positive";
        return undefined;
      },
    },
  ],
};

const LLM_SECTION: SectionDef = {
  key: "llm",
  title: "Configure LLM provider settings",
  successMessage: "LLM settings updated",
  fields: [
    {
      key: "provider",
      label: "Provider",
      type: "select",
      options: PROVIDER_OPTIONS,
    },
    {
      key: "model",
      label: "Model",
      type: "text",
      placeholder: DEFAULT_CONFIG.llm.model,
    },
    {
      key: "baseUrl",
      label: "Base URL",
      type: "text",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
    },
    {
      key: "temperature",
      label: "Temperature",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0 || n > 2) return "Must be between 0 and 2";
        return undefined;
      },
    },
    {
      key: "maxTokens",
      label: "Max Tokens",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
    {
      key: "timeoutMs",
      label: "Timeout (ms)",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
    },
    {
      key: "maxRetries",
      label: "Max Retries",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) return "Must be zero or positive";
        return undefined;
      },
    },
  ],
};

const SYNC_SECTION: SectionDef = {
  key: "sync",
  title: "Configure sync settings",
  successMessage: "Sync settings updated",
  fields: [
    {
      key: "concurrency",
      label: "Concurrency",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0 || !Number.isInteger(n)) {
          return "Must be a positive integer";
        }
        return undefined;
      },
    },
  ],
};

const IGNORE_SECTION: SectionDef = {
  key: "ignore",
  title: "Configure file ignore rules",
  successMessage: "Ignore settings updated",
  fields: [
    {
      key: "categories.vendor",
      label: "Ignore vendor directories (node_modules, vendor, etc.)",
      type: "boolean",
    },
    {
      key: "categories.generated",
      label: "Ignore generated files (dist, build, etc.)",
      type: "boolean",
    },
    {
      key: "categories.binary",
      label: "Ignore binary files",
      type: "boolean",
    },
    {
      key: "categories.config",
      label: "Ignore config files (.github, Dockerfile, etc.)",
      type: "boolean",
    },
    {
      key: "detectGenerated",
      label: "Detect generated files automatically",
      type: "boolean",
    },
    {
      key: "additional",
      label: "Additional ignore patterns (comma-separated)",
      type: "text",
      placeholder: "e.g., internal/, *.log",
      parseList: true,
      transform: {
        toDisplay: (value) =>
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
      },
    },
    {
      key: "exceptions",
      label: "Exceptions (comma-separated)",
      type: "text",
      placeholder: "e.g., !vendor/important/",
      parseList: true,
      transform: {
        toDisplay: (value) =>
          Array.isArray(value) ? value.join(", ") : (value ?? ""),
      },
    },
  ],
};

const GENERAL_SECTION: SectionDef = {
  key: "general",
  title: "Configure general settings",
  successMessage: "General settings updated",
  fields: [
    {
      key: "maxFileSize",
      label: "Max File Size (MB)",
      type: "number",
      validate: (v) => {
        if (!v.trim()) return undefined;
        const n = Number(v);
        if (Number.isNaN(n) || n <= 0) return "Must be a positive number";
        return undefined;
      },
      transform: {
        toDisplay: (value) =>
          typeof value === "number" ? value / (1024 * 1024) : value,
        fromDisplay: (value) =>
          typeof value === "number" ? value * 1024 * 1024 : value,
      },
    },
  ],
};

function getValueByPath(source: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function setValueByPath(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const parts = key.split(".");
  let cursor = target;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const current = cursor[part];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }

  cursor[parts[parts.length - 1]] = value;
}

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSectionCurrentAndDefaults(
  state: TUIState,
  section: SectionDef,
): {
  current: Record<string, unknown>;
  defaults: Record<string, unknown>;
} {
  switch (section.key) {
    case "embeddings":
      return {
        current: (state.config.embeddings ?? {}) as Record<string, unknown>,
        defaults: DEFAULT_CONFIG.embeddings as unknown as Record<
          string,
          unknown
        >,
      };
    case "llm":
      return {
        current: (state.config.llm ?? {}) as Record<string, unknown>,
        defaults: DEFAULT_CONFIG.llm as unknown as Record<string, unknown>,
      };
    case "sync":
      return {
        current: (state.config.sync ?? {}) as Record<string, unknown>,
        defaults: DEFAULT_CONFIG.sync as unknown as Record<string, unknown>,
      };
    case "ignore":
      return {
        current: (state.config.ignore ?? {}) as Record<string, unknown>,
        defaults: DEFAULT_CONFIG.ignore as unknown as Record<string, unknown>,
      };
    case "general":
      return {
        current: { maxFileSize: state.config.maxFileSize },
        defaults: { maxFileSize: DEFAULT_CONFIG.maxFileSize },
      };
  }
}

function getFieldPlaceholder(
  section: SectionDef,
  field: FieldDef,
  values: Record<string, unknown>,
): string | undefined {
  if (
    (section.key === "embeddings" || section.key === "llm") &&
    field.key === "baseUrl"
  ) {
    return values.provider === "ollama"
      ? OLLAMA_DEFAULT_BASE_URL
      : "Leave empty for default";
  }
  return field.placeholder;
}

function getSelectInitialValue(
  section: SectionDef,
  field: FieldDef,
  currentValue: unknown,
  defaultValue: unknown,
): string {
  if (
    section.key === "embeddings" &&
    field.key === "provider" &&
    currentValue === "anthropic"
  ) {
    return "openai";
  }
  return String(currentValue ?? defaultValue);
}

async function editSection(
  state: TUIState,
  section: SectionDef,
): Promise<void> {
  const { current, defaults } = getSectionCurrentAndDefaults(state, section);
  const values: Record<string, unknown> = {};

  p.note(
    section.title,
    section.key === "general"
      ? "General"
      : section.key === "llm"
        ? "LLM"
        : section.key.charAt(0).toUpperCase() + section.key.slice(1),
  );

  for (const field of section.fields) {
    let currentValue = getValueByPath(current, field.key);
    let defaultValue = getValueByPath(defaults, field.key);

    if (field.transform?.toDisplay) {
      currentValue = field.transform.toDisplay(currentValue);
      defaultValue = field.transform.toDisplay(defaultValue);
    }

    if (
      (section.key === "embeddings" || section.key === "llm") &&
      field.key === "baseUrl" &&
      values.provider === "ollama"
    ) {
      if (!current.baseUrl) {
        p.note(
          `Using default Ollama URL: ${OLLAMA_DEFAULT_BASE_URL}`,
          "Ollama",
        );
      }
      currentValue =
        (currentValue as string | undefined) ?? OLLAMA_DEFAULT_BASE_URL;
      defaultValue = OLLAMA_DEFAULT_BASE_URL;
    }

    if (field.type === "select") {
      const result = await p.select({
        message: `${field.label} (current: ${String(currentValue ?? defaultValue)})`,
        options: field.options ?? [],
        initialValue: getSelectInitialValue(
          section,
          field,
          currentValue,
          defaultValue,
        ),
      });

      if (p.isCancel(result)) return;

      setValueByPath(values, field.key, result);
      continue;
    }

    const result = await editField<string | number | boolean>(
      field.label,
      currentValue as string | number | boolean | undefined,
      (defaultValue ?? "") as string | number | boolean,
      {
        type: field.type,
        validate: field.validate,
        placeholder: getFieldPlaceholder(section, field, values),
      },
    );

    if (result.cancelled) return;

    let value: unknown = result.value;

    if (field.parseList) {
      value = typeof value === "string" ? parseCommaSeparatedList(value) : [];
    }

    if (field.transform?.fromDisplay && value !== undefined) {
      value = field.transform.fromDisplay(value);
    }

    setValueByPath(values, field.key, value);
  }

  if (section.key === "embeddings") {
    const provider =
      (values.provider as ProviderType | undefined) ??
      (current.provider as ProviderType | undefined) ??
      DEFAULT_CONFIG.embeddings.provider;
    const updated: Partial<EmbeddingsConfig> = { provider };

    const model = values.model as string | undefined;
    const baseUrl = values.baseUrl as string | undefined;
    const apiKey = values.apiKey as string | undefined;
    const dimensions = values.dimensions as number | undefined;
    const batchSize = values.batchSize as number | undefined;
    const timeoutMs = values.timeoutMs as number | undefined;
    const maxRetries = values.maxRetries as number | undefined;

    if (model && model !== DEFAULT_CONFIG.embeddings.model)
      updated.model = model;
    if (baseUrl) {
      updated.baseUrl = baseUrl;
    } else if (provider === "ollama") {
      updated.baseUrl = OLLAMA_DEFAULT_BASE_URL;
    }
    if (apiKey) updated.apiKey = apiKey;
    if (dimensions && dimensions > 0) updated.dimensions = dimensions;
    if (batchSize && batchSize !== DEFAULT_CONFIG.embeddings.batchSize) {
      updated.batchSize = batchSize;
    }
    if (timeoutMs && timeoutMs !== DEFAULT_CONFIG.embeddings.timeoutMs) {
      updated.timeoutMs = timeoutMs;
    }
    if (
      maxRetries !== undefined &&
      maxRetries !== DEFAULT_CONFIG.embeddings.maxRetries
    ) {
      updated.maxRetries = maxRetries;
    }

    if (Object.keys(updated).length > 0) {
      state.config.embeddings = {
        ...state.config.embeddings,
        ...updated,
      } as EmbeddingsConfig;
      state.hasChanges = true;
      p.note(section.successMessage, "Success");
    }
    return;
  }

  if (section.key === "llm") {
    const provider =
      (values.provider as ProviderType | undefined) ??
      (current.provider as ProviderType | undefined) ??
      DEFAULT_CONFIG.llm.provider;
    const updated: Partial<LLMConfig> = { provider };

    const model = values.model as string | undefined;
    const baseUrl = values.baseUrl as string | undefined;
    const apiKey = values.apiKey as string | undefined;
    const temperature = values.temperature as number | undefined;
    const maxTokens = values.maxTokens as number | undefined;
    const timeoutMs = values.timeoutMs as number | undefined;
    const maxRetries = values.maxRetries as number | undefined;

    if (model && model !== DEFAULT_CONFIG.llm.model) updated.model = model;
    if (baseUrl) {
      updated.baseUrl = baseUrl;
    } else if (provider === "ollama") {
      updated.baseUrl = OLLAMA_DEFAULT_BASE_URL;
    }
    if (apiKey) updated.apiKey = apiKey;
    if (
      temperature !== undefined &&
      temperature !== DEFAULT_CONFIG.llm.temperature
    ) {
      updated.temperature = temperature;
    }
    if (maxTokens && maxTokens !== DEFAULT_CONFIG.llm.maxTokens) {
      updated.maxTokens = maxTokens;
    }
    if (timeoutMs && timeoutMs !== DEFAULT_CONFIG.llm.timeoutMs) {
      updated.timeoutMs = timeoutMs;
    }
    if (
      maxRetries !== undefined &&
      maxRetries !== DEFAULT_CONFIG.llm.maxRetries
    ) {
      updated.maxRetries = maxRetries;
    }

    if (Object.keys(updated).length > 0) {
      state.config.llm = { ...state.config.llm, ...updated } as LLMConfig;
      state.hasChanges = true;
      p.note(section.successMessage, "Success");
    }
    return;
  }

  if (section.key === "sync") {
    const updated: Partial<SyncConfig> = {};
    const concurrency = values.concurrency as number | undefined;

    if (concurrency && concurrency !== DEFAULT_CONFIG.sync.concurrency) {
      updated.concurrency = concurrency;
    }

    if (Object.keys(updated).length > 0) {
      state.config.sync = { ...state.config.sync, ...updated } as SyncConfig;
      state.hasChanges = true;
      p.note(section.successMessage, "Success");
    }
    return;
  }

  if (section.key === "ignore") {
    const categories: IgnoreConfig["categories"] = {
      vendor:
        (getValueByPath(values, "categories.vendor") as boolean | undefined) ??
        DEFAULT_CONFIG.ignore.categories.vendor,
      generated:
        (getValueByPath(values, "categories.generated") as
          | boolean
          | undefined) ?? DEFAULT_CONFIG.ignore.categories.generated,
      binary:
        (getValueByPath(values, "categories.binary") as boolean | undefined) ??
        DEFAULT_CONFIG.ignore.categories.binary,
      config:
        (getValueByPath(values, "categories.config") as boolean | undefined) ??
        DEFAULT_CONFIG.ignore.categories.config,
    };

    const updated: Partial<IgnoreConfig> = {
      categories,
      detectGenerated:
        (values.detectGenerated as boolean | undefined) ??
        DEFAULT_CONFIG.ignore.detectGenerated,
    };

    const additional = (values.additional as string[] | undefined) ?? [];
    const exceptions = (values.exceptions as string[] | undefined) ?? [];

    if (additional.length > 0) updated.additional = additional;
    if (exceptions.length > 0) updated.exceptions = exceptions;

    state.config.ignore = updated as IgnoreConfig;
    state.hasChanges = true;
    p.note(section.successMessage, "Success");
    return;
  }

  const maxFileSize = values.maxFileSize as number | undefined;
  if (maxFileSize && maxFileSize !== DEFAULT_CONFIG.maxFileSize) {
    state.config.maxFileSize = maxFileSize;
    state.hasChanges = true;
    p.note(section.successMessage, "Success");
  }
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

async function testQdrantConnection(
  url: string,
  apiKey?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["api-key"] = apiKey;
    const response = await fetch(`${url.replace(/\/$/, "")}/healthz`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return { ok: true, message: "Connected successfully!" };
    }
    return { ok: false, message: `Server returned HTTP ${response.status}` };
  } catch (error) {
    // Node.js fetch wraps errors: error.message="fetch failed", actual error in error.cause
    const causeErr =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : null;
    const causeCode = (causeErr as NodeJS.ErrnoException | null)?.code ?? "";
    const causeMsg = causeErr?.message ?? "";
    const msg =
      causeMsg || (error instanceof Error ? error.message : String(error));
    const combined = `${msg} ${causeCode}`;
    if (combined.includes("abort") || combined.includes("timeout")) {
      return { ok: false, message: "Connection timed out (5s)" };
    }
    if (combined.includes("ECONNREFUSED")) {
      return { ok: false, message: "Connection refused — is Qdrant running?" };
    }
    if (combined.includes("ENOTFOUND")) {
      return { ok: false, message: "Host not found — check the URL" };
    }
    if (combined.includes("ECONNRESET") || combined.includes("EPIPE")) {
      return {
        ok: false,
        message: "Connection reset — server may be starting up",
      };
    }
    return {
      ok: false,
      message: msg || "Connection failed — check URL and network",
    };
  }
}

async function editQdrant(state: TUIState): Promise<void> {
  const current: Partial<QdrantConfig> = state.config.qdrant ?? {};
  const defaults = DEFAULT_CONFIG.qdrant;

  p.note("Configure Qdrant vector database connection", "Qdrant");

  const instanceType = await p.select({
    message: "How is your Qdrant instance running?",
    options: [
      {
        value: "local" as const,
        label: "Local",
        hint: "Docker or native on this machine (localhost)",
      },
      {
        value: "remote" as const,
        label: "Remote / Cloud",
        hint: "Qdrant Cloud or self-hosted remote server",
      },
    ],
  });
  if (p.isCancel(instanceType)) return;

  let url: string;
  let apiKey: string | undefined;

  if (instanceType === "local") {
    const portResult = await p.text({
      message: "Qdrant port:",
      initialValue: current.url ? new URL(current.url).port || "6333" : "6333",
      placeholder: "6333",
      validate: (v) => {
        const n = Number(v.trim());
        if (
          !v.trim() ||
          Number.isNaN(n) ||
          n < 1 ||
          n > 65535 ||
          !Number.isInteger(n)
        ) {
          return "Must be a valid port number (1-65535)";
        }
        return undefined;
      },
    });
    if (p.isCancel(portResult)) return;
    const port = portResult.trim() || "6333";
    url = `http://localhost:${port}`;
    apiKey = undefined;
  } else {
    const urlResult = await p.text({
      message: "Qdrant URL:",
      initialValue:
        current.url && current.url !== defaults.url ? current.url : "",
      placeholder: "https://your-instance.cloud.qdrant.io:6333",
      validate: (v) => {
        if (!v.trim()) return "URL is required for remote instances";
        try {
          new URL(v.trim());
          return undefined;
        } catch {
          return "Must be a valid URL (e.g., https://host:6333)";
        }
      },
    });
    if (p.isCancel(urlResult)) return;
    url = urlResult.trim();

    const apiKeyResult = await p.password({
      message: "Qdrant API Key:",
      validate: (v) => {
        if (!v || !v.trim())
          return "API key is required for remote Qdrant instances";
        return undefined;
      },
    });
    if (p.isCancel(apiKeyResult)) return;
    apiKey = apiKeyResult?.trim() || undefined;
  }

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

  const shouldTest = await p.confirm({
    message: "Test connection now?",
    initialValue: true,
  });

  if (!p.isCancel(shouldTest) && shouldTest) {
    const spinner = p.spinner();
    spinner.start(`Connecting to ${url}...`);
    const result = await testQdrantConnection(url, apiKey);
    if (result.ok) {
      spinner.stop(chalk.green(`✓ ${result.message}`));
    } else {
      spinner.stop(chalk.red(`✗ ${result.message}`));
      const proceed = await p.confirm({
        message: "Connection failed. Save settings anyway?",
        initialValue: false,
      });
      if (p.isCancel(proceed) || !proceed) return;
    }
  }

  const updated: Partial<QdrantConfig> = { url };
  if (apiKey) updated.apiKey = apiKey;
  if (collectionPrefix && collectionPrefix !== defaults.collectionPrefix) {
    updated.collectionPrefix = collectionPrefix;
  }

  state.config.qdrant = { ...state.config.qdrant, ...updated } as QdrantConfig;
  state.hasChanges = true;
  p.note("Qdrant settings updated", "Success");
}

export async function runSetupWizard(state: TUIState): Promise<void> {
  p.note(
    "This wizard will guide you through the essential configuration.\n" +
      "You can always fine-tune settings later via the main menu.",
    "Quick Setup",
  );

  p.note("Step 1 of 3: Vector Database", "Qdrant");
  await editQdrant(state);
  if (!state.hasChanges) return;

  p.note(
    "Step 2 of 3: Embeddings Provider\n\nEmbeddings convert your code into searchable vectors.",
    "Embeddings",
  );

  const embProvider = await p.select({
    message: "Select embeddings provider:",
    options: EMBEDDINGS_PROVIDER_OPTIONS,
    initialValue:
      state.config.embeddings?.provider ?? DEFAULT_CONFIG.embeddings.provider,
  });
  if (p.isCancel(embProvider)) return;

  const embeddingsUpdate: Partial<EmbeddingsConfig> = {
    provider: embProvider as ProviderType,
  };

  if (embProvider === "ollama") {
    const baseUrl = state.config.embeddings?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL;
    p.note(`Using Ollama at ${baseUrl}`, "Ollama");

    const modelResult = await p.text({
      message: "Embeddings model:",
      initialValue: state.config.embeddings?.model ?? "nomic-embed-text",
      placeholder: "nomic-embed-text",
    });
    if (p.isCancel(modelResult)) return;
    embeddingsUpdate.model = modelResult.trim() || "nomic-embed-text";
    embeddingsUpdate.baseUrl = baseUrl;
  } else {
    const apiKeyResult = await p.password({
      message: `${embProvider === "openai" ? "OpenAI" : "Google"} API Key for embeddings:`,
    });
    if (p.isCancel(apiKeyResult)) return;
    if (apiKeyResult?.trim()) embeddingsUpdate.apiKey = apiKeyResult.trim();
  }

  state.config.embeddings = {
    ...state.config.embeddings,
    ...embeddingsUpdate,
  } as EmbeddingsConfig;
  state.hasChanges = true;

  p.note(
    "Step 3 of 3: LLM Provider\n\nThe LLM generates answers from your code (RAG).",
    "LLM",
  );

  const llmProvider = await p.select({
    message: "Select LLM provider:",
    options: PROVIDER_OPTIONS,
    initialValue: state.config.llm?.provider ?? DEFAULT_CONFIG.llm.provider,
  });
  if (p.isCancel(llmProvider)) return;

  const llmUpdate: Partial<LLMConfig> = {
    provider: llmProvider as ProviderType,
  };

  if (llmProvider === "anthropic") {
    p.note(
      "Note: Anthropic does not provide embeddings.\n" +
        "Your embeddings provider is set separately (Step 2).",
      "Anthropic",
    );
  }

  if (llmProvider === "ollama") {
    const baseUrl = state.config.llm?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL;
    p.note(`Using Ollama at ${baseUrl}`, "Ollama");

    const modelResult = await p.text({
      message: "LLM model:",
      initialValue: state.config.llm?.model ?? "llama3.2",
      placeholder: "llama3.2",
    });
    if (p.isCancel(modelResult)) return;
    llmUpdate.model = modelResult.trim() || "llama3.2";
    llmUpdate.baseUrl = baseUrl;
  } else {
    const sameProvider = embProvider === llmProvider;
    const existingKey = sameProvider
      ? state.config.embeddings?.apiKey
      : undefined;

    if (existingKey) {
      const reuseKey = await p.confirm({
        message: `Reuse the ${llmProvider} API key from embeddings?`,
        initialValue: true,
      });
      if (p.isCancel(reuseKey)) return;
      if (reuseKey) {
        llmUpdate.apiKey = existingKey;
      } else {
        const apiKeyResult = await p.password({
          message: `${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)} API Key for LLM:`,
        });
        if (p.isCancel(apiKeyResult)) return;
        if (apiKeyResult?.trim()) llmUpdate.apiKey = apiKeyResult.trim();
      }
    } else {
      const apiKeyResult = await p.password({
        message: `${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)} API Key for LLM:`,
      });
      if (p.isCancel(apiKeyResult)) return;
      if (apiKeyResult?.trim()) llmUpdate.apiKey = apiKeyResult.trim();
    }
  }

  state.config.llm = { ...state.config.llm, ...llmUpdate } as LLMConfig;
  state.hasChanges = true;

  await saveConfig(state);
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

  const isEmptyConfig = Object.keys(state.config).length === 0;
  if (isEmptyConfig) {
    const useWizard = await p.confirm({
      message: "No configuration found. Run the quick setup wizard?",
      initialValue: true,
    });

    if (!p.isCancel(useWizard) && useWizard) {
      await runSetupWizard(state);
      p.outro("Configuration complete!");
      return;
    }
  }

  await mainMenuLoop(state);
  p.outro("Configuration complete!");
}
