import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import { z } from "zod";

const LOCAL_CONFIG_FILES = [".mgreprc.yaml", ".mgreprc.yml"] as const;
const GLOBAL_CONFIG_DIR = ".config/mgrep";
const GLOBAL_CONFIG_FILES = ["config.yaml", "config.yml"] as const;
const ENV_PREFIX = "MGREP_";
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const ProviderTypeSchema = z.enum(["openai", "google", "anthropic", "ollama"]);

const EmbeddingsConfigSchema = z.object({
  provider: ProviderTypeSchema.default("openai"),
  model: z.string().default("text-embedding-3-small"),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  dimensions: z.number().positive().optional(),
  batchSize: z.number().positive().default(100),
  timeoutMs: z.number().int().positive().default(30000),
  maxRetries: z.number().int().min(0).default(3),
});

const LLMConfigSchema = z.object({
  provider: ProviderTypeSchema.default("openai"),
  model: z.string().default("gpt-4o-mini"),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(4096),
  timeoutMs: z.number().int().positive().default(60000),
  maxRetries: z.number().int().min(0).default(3),
});

const QdrantConfigSchema = z.object({
  url: z.string().default("http://localhost:6333"),
  apiKey: z.string().optional(),
  collectionPrefix: z.string().default("mgrep_"),
});

const SyncConfigSchema = z.object({
  concurrency: z.number().int().positive().default(20),
});

const TavilyConfigSchema = z.object({
  apiKey: z.string().optional(),
  maxResults: z.number().int().positive().default(10),
  searchDepth: z.enum(["basic", "advanced"]).default("basic"),
  includeImages: z.boolean().default(false),
  includeRawContent: z.boolean().default(false),
});

const ConfigSchema = z.object({
  maxFileSize: z.number().positive().optional(),
  qdrant: QdrantConfigSchema.default({}),
  embeddings: EmbeddingsConfigSchema.default({}),
  llm: LLMConfigSchema.default({}),
  sync: SyncConfigSchema.default({}),
  tavily: TavilyConfigSchema.default({}),
});

export type ProviderType = z.infer<typeof ProviderTypeSchema>;
export type EmbeddingsConfig = z.infer<typeof EmbeddingsConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type TavilyConfig = z.infer<typeof TavilyConfigSchema>;

/**
 * CLI options that can override config
 */
export interface CliConfigOptions {
  maxFileSize?: number;
}

/**
 * Mgrep configuration options
 */
export interface MgrepConfig {
  /**
   * Maximum file size in bytes that is allowed to upload.
   * Files larger than this will be skipped during sync.
   * @default 10485760 (10 MB)
   */
  maxFileSize: number;
  /**
   * Qdrant vector database configuration
   */
  qdrant: QdrantConfig;
  /**
   * Embeddings provider configuration
   */
  embeddings: EmbeddingsConfig;
  /**
   * LLM provider configuration
   */
  llm: LLMConfig;
  /**
   * Sync configuration
   */
  sync: SyncConfig;
  /**
   * Tavily web search configuration
   */
  tavily: TavilyConfig;
}

const DEFAULT_CONFIG: MgrepConfig = {
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  qdrant: {
    url: "http://localhost:6333",
    collectionPrefix: "mgrep_",
  },
  embeddings: {
    provider: "openai",
    model: "text-embedding-3-small",
    batchSize: 100,
    timeoutMs: 30000,
    maxRetries: 3,
  },
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 4096,
    timeoutMs: 60000,
    maxRetries: 3,
  },
  sync: {
    concurrency: 20,
  },
  tavily: {
    maxResults: 10,
    searchDepth: "basic",
    includeImages: false,
    includeRawContent: false,
  },
};

const configCache = new Map<string, MgrepConfig>();

/**
 * Reads and parses a YAML config file
 *
 * @param filePath - The path to the config file
 * @returns The parsed config object or null if file doesn't exist or is invalid
 */
function readYamlConfig(filePath: string): Partial<MgrepConfig> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = YAML.parse(content);
    const validated = ConfigSchema.partial().parse(parsed);
    return validated as Partial<MgrepConfig>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: Failed to parse config file ${filePath}: ${message}`,
    );
    return null;
  }
}

/**
 * Finds and reads the first existing config file from a list of candidates
 *
 * @param candidates - List of file paths to check
 * @returns The parsed config or null if none found
 */
function findConfig(candidates: string[]): Partial<MgrepConfig> | null {
  for (const filePath of candidates) {
    const config = readYamlConfig(filePath);
    if (config !== null) {
      return config;
    }
  }
  return null;
}

/**
 * Returns all global config file paths that are checked.
 */
export function getGlobalConfigPaths(): string[] {
  const configDir = path.join(os.homedir(), GLOBAL_CONFIG_DIR);
  return GLOBAL_CONFIG_FILES.map((file) => path.join(configDir, file));
}

/**
 * Returns all local config file paths that would be checked for a given directory.
 *
 * @param dir - The directory to get local config paths for
 */
export function getLocalConfigPaths(dir: string): string[] {
  return LOCAL_CONFIG_FILES.map((file) => path.join(dir, file));
}

/**
 * Returns all config file paths (local + global) that would be checked.
 * Useful for setting up file watchers.
 *
 * @param dir - The directory to get config paths for
 */
export function getConfigPaths(dir: string): string[] {
  return [...getLocalConfigPaths(dir), ...getGlobalConfigPaths()];
}

/**
 * Loads configuration from environment variables
 *
 * @returns The config values from environment variables
 */
function loadEnvConfig(): Partial<MgrepConfig> {
  const config: Partial<MgrepConfig> = {};

  // General
  const maxFileSizeEnv = process.env[`${ENV_PREFIX}MAX_FILE_SIZE`];
  if (maxFileSizeEnv) {
    const parsed = Number.parseInt(maxFileSizeEnv, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      config.maxFileSize = parsed;
    }
  }

  // Qdrant - only set fields that are explicitly defined in env vars
  const qdrantUrl = process.env[`${ENV_PREFIX}QDRANT_URL`];
  const qdrantApiKey = process.env[`${ENV_PREFIX}QDRANT_API_KEY`];
  const qdrantPrefix = process.env[`${ENV_PREFIX}QDRANT_COLLECTION_PREFIX`];
  if (qdrantUrl || qdrantApiKey || qdrantPrefix) {
    // Only include fields that are explicitly set in environment variables
    // This allows file configs to provide the base values
    (config as { qdrant?: Partial<QdrantConfig> }).qdrant = {
      ...(qdrantUrl && { url: qdrantUrl }),
      ...(qdrantApiKey && { apiKey: qdrantApiKey }),
      ...(qdrantPrefix && { collectionPrefix: qdrantPrefix }),
    };
  }

  // Embeddings - only set fields that are explicitly defined in env vars
  const embProvider = process.env[`${ENV_PREFIX}EMBEDDINGS_PROVIDER`];
  const embModel = process.env[`${ENV_PREFIX}EMBEDDINGS_MODEL`];
  const embBaseUrl = process.env[`${ENV_PREFIX}EMBEDDINGS_BASE_URL`];
  const embApiKey = process.env[`${ENV_PREFIX}EMBEDDINGS_API_KEY`];
  const embTimeoutMs = process.env[`${ENV_PREFIX}EMBEDDINGS_TIMEOUT_MS`];
  const embMaxRetries = process.env[`${ENV_PREFIX}EMBEDDINGS_MAX_RETRIES`];
  if (
    embProvider ||
    embModel ||
    embBaseUrl ||
    embApiKey ||
    embTimeoutMs ||
    embMaxRetries
  ) {
    const embeddings: Partial<EmbeddingsConfig> = {};
    if (embProvider) embeddings.provider = embProvider as ProviderType;
    if (embModel) embeddings.model = embModel;
    if (embBaseUrl) embeddings.baseUrl = embBaseUrl;
    if (embApiKey) embeddings.apiKey = embApiKey;
    if (embTimeoutMs) embeddings.timeoutMs = Number.parseInt(embTimeoutMs, 10);
    if (embMaxRetries)
      embeddings.maxRetries = Number.parseInt(embMaxRetries, 10);
    config.embeddings = embeddings as EmbeddingsConfig;
  }

  // LLM - only set fields that are explicitly defined in env vars
  const llmProvider = process.env[`${ENV_PREFIX}LLM_PROVIDER`];
  const llmModel = process.env[`${ENV_PREFIX}LLM_MODEL`];
  const llmBaseUrl = process.env[`${ENV_PREFIX}LLM_BASE_URL`];
  const llmApiKey = process.env[`${ENV_PREFIX}LLM_API_KEY`];
  const llmTemperature = process.env[`${ENV_PREFIX}LLM_TEMPERATURE`];
  const llmMaxTokens = process.env[`${ENV_PREFIX}LLM_MAX_TOKENS`];
  const llmTimeoutMs = process.env[`${ENV_PREFIX}LLM_TIMEOUT_MS`];
  const llmMaxRetries = process.env[`${ENV_PREFIX}LLM_MAX_RETRIES`];
  if (
    llmProvider ||
    llmModel ||
    llmBaseUrl ||
    llmApiKey ||
    llmTemperature ||
    llmMaxTokens ||
    llmTimeoutMs ||
    llmMaxRetries
  ) {
    const llm: Partial<LLMConfig> = {};
    if (llmProvider) llm.provider = llmProvider as ProviderType;
    if (llmModel) llm.model = llmModel;
    if (llmBaseUrl) llm.baseUrl = llmBaseUrl;
    if (llmApiKey) llm.apiKey = llmApiKey;
    if (llmTemperature) llm.temperature = Number.parseFloat(llmTemperature);
    if (llmMaxTokens) llm.maxTokens = Number.parseInt(llmMaxTokens, 10);
    if (llmTimeoutMs) llm.timeoutMs = Number.parseInt(llmTimeoutMs, 10);
    if (llmMaxRetries) llm.maxRetries = Number.parseInt(llmMaxRetries, 10);
    config.llm = llm as LLMConfig;
  }

  // Sync
  const syncConcurrency = process.env[`${ENV_PREFIX}SYNC_CONCURRENCY`];
  if (syncConcurrency) {
    const parsed = Number.parseInt(syncConcurrency, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      config.sync = { concurrency: parsed };
    }
  }

  // Tavily
  const tavilyApiKey = process.env[`${ENV_PREFIX}TAVILY_API_KEY`];
  const tavilyMaxResults = process.env[`${ENV_PREFIX}TAVILY_MAX_RESULTS`];
  const tavilySearchDepth = process.env[`${ENV_PREFIX}TAVILY_SEARCH_DEPTH`];
  if (tavilyApiKey || tavilyMaxResults || tavilySearchDepth) {
    config.tavily = {
      apiKey: tavilyApiKey,
      maxResults: tavilyMaxResults
        ? Number.parseInt(tavilyMaxResults, 10)
        : DEFAULT_CONFIG.tavily.maxResults,
      searchDepth:
        (tavilySearchDepth as "basic" | "advanced") ||
        DEFAULT_CONFIG.tavily.searchDepth,
      includeImages: DEFAULT_CONFIG.tavily.includeImages,
      includeRawContent: DEFAULT_CONFIG.tavily.includeRawContent,
    };
  }

  return config;
}

/**
 * Deep merges configuration objects
 */
function deepMergeConfig(
  target: MgrepConfig,
  ...sources: Partial<MgrepConfig>[]
): MgrepConfig {
  const result: MgrepConfig = {
    maxFileSize: target.maxFileSize,
    qdrant: { ...target.qdrant },
    embeddings: { ...target.embeddings },
    llm: { ...target.llm },
    sync: { ...target.sync },
    tavily: { ...target.tavily },
  };

  for (const source of sources) {
    if (!source) continue;

    if (source.maxFileSize !== undefined) {
      result.maxFileSize = source.maxFileSize;
    }
    if (source.qdrant) {
      result.qdrant = { ...result.qdrant, ...source.qdrant };
    }
    if (source.embeddings) {
      result.embeddings = { ...result.embeddings, ...source.embeddings };
    }
    if (source.llm) {
      result.llm = { ...result.llm, ...source.llm };
    }
    if (source.sync) {
      result.sync = { ...result.sync, ...source.sync };
    }
    if (source.tavily) {
      result.tavily = { ...result.tavily, ...source.tavily };
    }
  }

  return result;
}

/**
 * Loads mgrep configuration with the following precedence (highest to lowest):
 * 1. CLI flags (passed as cliOptions)
 * 2. Environment variables (MGREP_*)
 * 3. Local config file (.mgreprc.yaml or .mgreprc.yml in project directory)
 * 4. Global config file (~/.config/mgrep/config.yaml or config.yml)
 * 5. Default values
 *
 * @param dir - The directory to load local configuration from
 * @param cliOptions - CLI options that override all other config sources
 * @returns The merged configuration
 */
export function loadConfig(
  dir: string,
  cliOptions: CliConfigOptions = {},
): MgrepConfig {
  const absoluteDir = path.resolve(dir);
  const cacheKey = `${absoluteDir}:${JSON.stringify(cliOptions)}`;

  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey) as MgrepConfig;
  }

  const globalConfig = findConfig(getGlobalConfigPaths());
  const localConfig = findConfig(getLocalConfigPaths(absoluteDir));
  const envConfig = loadEnvConfig();

  const config: MgrepConfig = deepMergeConfig(
    DEFAULT_CONFIG,
    globalConfig || {},
    localConfig || {},
    envConfig,
    filterUndefinedCliOptions(cliOptions),
  );

  configCache.set(cacheKey, config);
  return config;
}

function filterUndefinedCliOptions(
  options: CliConfigOptions,
): Partial<MgrepConfig> {
  const result: Partial<MgrepConfig> = {};
  if (options.maxFileSize !== undefined) {
    result.maxFileSize = options.maxFileSize;
  }
  return result;
}

/**
 * Clears the configuration cache.
 * Useful for testing or when config files may have changed.
 */
export function clearConfigCache(): void {
  configCache.clear();
}

export interface LoadConfigOptions {
  /**
   * If true, bypasses the cache and reloads from disk.
   * @default false
   */
  reload?: boolean;
}

/**
 * Loads configuration with options.
 *
 * @param dir - The directory to load local configuration from
 * @param cliOptions - CLI options that override all other config sources
 * @param options - Additional loading options
 * @returns The merged configuration, or null if reload failed
 */
export function loadConfigWithOptions(
  dir: string,
  cliOptions: CliConfigOptions = {},
  options: LoadConfigOptions = {},
): MgrepConfig | null {
  const absoluteDir = path.resolve(dir);
  const cacheKey = `${absoluteDir}:${JSON.stringify(cliOptions)}`;

  if (options.reload) {
    configCache.delete(cacheKey);
  } else if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey) as MgrepConfig;
  }

  try {
    const globalConfig = findConfig(getGlobalConfigPaths());
    const localConfig = findConfig(getLocalConfigPaths(absoluteDir));
    const envConfig = loadEnvConfig();

    const config: MgrepConfig = deepMergeConfig(
      DEFAULT_CONFIG,
      globalConfig || {},
      localConfig || {},
      envConfig,
      filterUndefinedCliOptions(cliOptions),
    );

    configCache.set(cacheKey, config);
    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to reload config: ${message}`);
    return null;
  }
}

/**
 * Reloads configuration from disk, bypassing the cache.
 * If the reload fails, returns null (caller should keep previous config).
 *
 * @param dir - The directory to load local configuration from
 * @param cliOptions - CLI options that override all other config sources
 * @returns The new configuration, or null if reload failed
 */
export function reloadConfig(
  dir: string,
  cliOptions: CliConfigOptions = {},
): MgrepConfig | null {
  return loadConfigWithOptions(dir, cliOptions, { reload: true });
}

/**
 * Checks if a file exceeds the maximum allowed file size
 *
 * @param filePath - The path to the file to check
 * @param maxFileSize - The maximum allowed file size in bytes
 * @returns True if the file exceeds the limit, false otherwise
 */
export function exceedsMaxFileSize(
  filePath: string,
  maxFileSize: number,
): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.size > maxFileSize;
  } catch {
    return false;
  }
}

/**
 * Formats a file size in bytes to a human-readable string
 *
 * @param bytes - The file size in bytes
 * @returns Human-readable file size string
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}
