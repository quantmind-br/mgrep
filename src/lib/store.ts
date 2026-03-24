export interface FileMetadata {
  path: string;
  hash: string;
  /**
   * File size in bytes (optional, for sync optimization)
   */
  size?: number;
  /**
   * File modification time in milliseconds (optional, for sync optimization)
   */
  mtimeMs?: number;
}

/**
 * Vendor-neutral search filter types
 */
export interface SearchFilterCondition {
  key: string;
  operator: "starts_with" | "equals" | "contains";
  value: string;
}

export interface SearchFilter {
  all?: SearchFilterCondition[];
}

/**
 * Vendor-neutral chunk types (replacing @mixedbread/sdk types)
 */
export interface BaseChunk {
  score: number;
  metadata?: FileMetadata | Record<string, unknown>;
  chunk_index: number;
  generated_metadata?: {
    start_line?: number;
    num_lines?: number;
    type?: string;
  };
}

export interface TextChunk extends BaseChunk {
  type: "text";
  text: string;
  filename?: string; // For web results
}

export interface ImageURLChunk extends BaseChunk {
  type: "image_url";
  image_url: { url: string };
}

export interface AudioURLChunk extends BaseChunk {
  type: "audio_url";
  audio_url: { url: string };
}

export interface VideoURLChunk extends BaseChunk {
  type: "video_url";
  video_url: { url: string };
}

export type ChunkType =
  | TextChunk
  | ImageURLChunk
  | AudioURLChunk
  | VideoURLChunk;

export interface StoreFile {
  external_id: string | null;
  metadata: FileMetadata | null;
}

export interface UploadFileOptions {
  external_id: string;
  overwrite?: boolean;
  metadata?: FileMetadata;
}

export interface SearchResponse {
  data: ChunkType[];
}

export interface AskResponse {
  answer: string;
  sources: ChunkType[];
}

export interface CreateStoreOptions {
  name: string;
  description?: string;
}

export interface StoreInfo {
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  counts: {
    pending: number;
    in_progress: number;
  };
}

/**
 * Statistics about a store - optimized for fast retrieval
 */
export interface StoreStats {
  store_name: string;
  description: string;
  chunk_count: number;
  /**
   * Estimated file count (may be approximate for performance)
   */
  file_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Interface for store operations
 */
export interface ListFilesOptions {
  pathPrefix?: string;
}

export interface Store {
  /**
   * List files in a store as an async iterator
   *
   * @param storeId - The ID of the store
   * @param options - Optional filtering options
   * @param options.pathPrefix - Only return files whose path starts with this prefix
   */
  listFiles(
    storeId: string,
    options?: ListFilesOptions,
  ): AsyncGenerator<StoreFile>;

  /**
   * Upload a file to a store
   */
  uploadFile(
    storeId: string,
    file: File | ReadableStream,
    options: UploadFileOptions,
  ): Promise<void>;

  /**
   * Delete a file from a store by its external ID
   */
  deleteFile(storeId: string, externalId: string): Promise<void>;

  /**
   * Search in one or more stores
   */
  search(
    storeIds: string[],
    query: string,
    top_k?: number,
    search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<SearchResponse>;

  /**
   * Retrieve store information
   */
  retrieve(storeId: string): Promise<unknown>;

  /**
   * Create a new store
   */
  create(options: CreateStoreOptions): Promise<unknown>;

  /**
   * Ask a question to one or more stores
   */
  ask(
    storeIds: string[],
    question: string,
    top_k?: number,
    search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<AskResponse>;

  /**
   * Get store information
   */
  getInfo(storeId: string): Promise<StoreInfo>;

  getStats(storeId: string): Promise<StoreStats>;

  /**
   * Refresh the client with a new JWT token (optional, for long-running sessions)
   */
  refreshClient?(): Promise<void>;
}

/**
 * Backward compatibility re-export of TestStore from test-store.ts
 */
export { TestStore } from "./test-store.js";
