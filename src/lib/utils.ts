import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { isText } from "istextorbinary";
import pLimit from "p-limit";
import { exceedsMaxFileSize, loadConfig, type MgrepConfig } from "./config.js";
import type { FileSystem } from "./file.js";
import type { FileMetadata, Store } from "./store.js";
import type { InitialSyncProgress, InitialSyncResult } from "./sync-helpers.js";

export const isTest = process.env.MGREP_IS_TEST === "1";

/**
 * Extended file metadata including size and mtime for sync optimization.
 */
export interface StoreFileMetadata {
  hash: string;
  size?: number;
  mtimeMs?: number;
}

function isSubpath(parent: string, child: string): boolean {
  const parentPath = path.resolve(parent);
  const childPath = path.resolve(child);

  const parentWithSep = parentPath.endsWith(path.sep)
    ? parentPath
    : parentPath + path.sep;

  return childPath.startsWith(parentWithSep);
}

export function computeBufferHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function computeFileHash(
  filePath: string,
  readFileSyncFn: (p: string) => Buffer,
): string {
  const buffer = readFileSyncFn(filePath);
  return computeBufferHash(buffer);
}

export function isDevelopment(): boolean {
  if (process.env.NODE_ENV === "development" || isTest) {
    return true;
  }

  return false;
}

/**
 * Lists file metadata from the store, optionally filtered by path prefix.
 * Returns extended metadata including size and mtime for sync optimization.
 *
 * @param store - The store instance
 * @param storeId - The ID of the store
 * @param pathPrefix - Optional path prefix to filter files
 * @returns A map of external IDs to their metadata
 */
export async function listStoreFileMetadata(
  store: Store,
  storeId: string,
  pathPrefix?: string,
): Promise<Map<string, StoreFileMetadata>> {
  const byExternalId = new Map<string, StoreFileMetadata>();
  for await (const file of store.listFiles(storeId, { pathPrefix })) {
    const externalId = file.external_id ?? undefined;
    if (!externalId) continue;
    const metadata = file.metadata;
    if (metadata && typeof metadata.hash === "string") {
      byExternalId.set(externalId, {
        hash: metadata.hash,
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
      });
    }
  }
  return byExternalId;
}

/**
 * Lists file hashes from the store, optionally filtered by path prefix.
 * @deprecated Use listStoreFileMetadata instead for better sync optimization
 *
 * @param store - The store instance
 * @param storeId - The ID of the store
 * @param pathPrefix - Optional path prefix to filter files (only files starting with this path are returned)
 * @returns A map of external IDs to their hashes
 */
export async function listStoreFileHashes(
  store: Store,
  storeId: string,
  pathPrefix?: string,
): Promise<Map<string, string | undefined>> {
  const metadata = await listStoreFileMetadata(store, storeId, pathPrefix);
  return new Map(Array.from(metadata.entries()).map(([k, v]) => [k, v.hash]));
}

export async function deleteFile(
  store: Store,
  storeId: string,
  filePath: string,
): Promise<void> {
  await store.deleteFile(storeId, filePath);
}

export interface UploadFileWithStatOptions {
  /** Pre-computed file stats to avoid duplicate stat calls */
  stat?: fs.Stats;
  /** Pre-read buffer to avoid duplicate read calls */
  buffer?: Buffer;
}

export async function uploadFile(
  store: Store,
  storeId: string,
  filePath: string,
  fileName: string,
  config?: MgrepConfig,
  uploadOptions?: UploadFileWithStatOptions,
): Promise<boolean> {
  if (config && exceedsMaxFileSize(filePath, config.maxFileSize)) {
    return false;
  }

  // Use provided buffer or read from disk
  const buffer =
    uploadOptions?.buffer ?? (await fs.promises.readFile(filePath));
  if (buffer.length === 0) {
    return false;
  }

  // Use provided stat or get from disk
  const stat = uploadOptions?.stat ?? (await fs.promises.stat(filePath));

  const hash = computeBufferHash(buffer);
  const metadata: FileMetadata = {
    path: filePath,
    hash,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
  const options = {
    external_id: filePath,
    overwrite: true,
    metadata,
  };

  try {
    await store.uploadFile(
      storeId,
      fs.createReadStream(filePath) as unknown as File | ReadableStream,
      options,
    );
  } catch (_streamErr) {
    if (!isText(filePath)) {
      return false;
    }
    await store.uploadFile(
      storeId,
      new File([new Uint8Array(buffer)], fileName, { type: "text/plain" }),
      options,
    );
  }
  return true;
}

/**
 * Checks if file can be skipped based on size/mtime metadata match.
 * This is a heuristic optimization - if size and mtime match, we skip the expensive hash comparison.
 *
 * Trade-off: A file touched without content change (e.g., `touch`) will have different mtime
 * but same hash, causing unnecessary re-upload. This is acceptable for the performance gain.
 */
function canSkipByMetadata(
  stat: fs.Stats,
  storedMeta: StoreFileMetadata,
): boolean {
  // If stored metadata doesn't have size/mtime, we can't optimize
  if (storedMeta.size === undefined || storedMeta.mtimeMs === undefined) {
    return false;
  }

  // Compare size and mtime
  return stat.size === storedMeta.size && stat.mtimeMs === storedMeta.mtimeMs;
}

export async function initialSync(
  store: Store,
  fileSystem: FileSystem,
  storeId: string,
  repoRoot: string,
  dryRun?: boolean,
  onProgress?: (info: InitialSyncProgress) => void,
  config?: MgrepConfig,
): Promise<InitialSyncResult> {
  const storeMetadata = await listStoreFileMetadata(store, storeId, repoRoot);
  const allFiles = Array.from(fileSystem.getFiles(repoRoot));
  const repoFiles = allFiles.filter(
    (filePath) => !fileSystem.isIgnored(filePath, repoRoot),
  );
  const repoFileSet = new Set(repoFiles);

  const filesToDelete = Array.from(storeMetadata.keys()).filter(
    (filePath) => isSubpath(repoRoot, filePath) && !repoFileSet.has(filePath),
  );

  const total = repoFiles.length + filesToDelete.length;
  let processed = 0;
  let uploaded = 0;
  let deleted = 0;
  let errors = 0;

  // Use configurable concurrency from config, default to 20
  const effectiveConfig = config || loadConfig(repoRoot);
  const concurrency = effectiveConfig.sync?.concurrency || 20;
  const limit = pLimit(concurrency);

  await Promise.all([
    ...repoFiles.map((filePath) =>
      limit(async () => {
        try {
          if (config && exceedsMaxFileSize(filePath, config.maxFileSize)) {
            processed += 1;
            onProgress?.({
              processed,
              uploaded,
              deleted,
              errors,
              total,
              filePath,
            });
            return;
          }

          // Get file stats first (needed for metadata optimization and upload)
          const stat = await fs.promises.stat(filePath);
          const existingMeta = storeMetadata.get(filePath);

          // Optimization: skip if size and mtime match (no need to read file)
          if (existingMeta && canSkipByMetadata(stat, existingMeta)) {
            processed += 1;
            onProgress?.({
              processed,
              uploaded,
              deleted,
              errors,
              total,
              filePath,
            });
            return;
          }

          // Need to read file and compare hash
          const buffer = await fs.promises.readFile(filePath);
          const hash = computeBufferHash(buffer);
          processed += 1;

          // Check if hash changed (or file is new / needs migration)
          const shouldUpload = !existingMeta || existingMeta.hash !== hash;

          if (dryRun && shouldUpload) {
            console.log("Dry run: would have uploaded", filePath);
            uploaded += 1;
          } else if (shouldUpload) {
            const didUpload = await uploadFile(
              store,
              storeId,
              filePath,
              path.basename(filePath),
              config,
              { stat, buffer },
            );
            if (didUpload) {
              uploaded += 1;
            }
          }
          onProgress?.({
            processed,
            uploaded,
            deleted,
            errors,
            total,
            filePath,
          });
        } catch (err) {
          processed += 1;
          errors += 1;
          const errorMessage = err instanceof Error ? err.message : String(err);
          onProgress?.({
            processed,
            uploaded,
            deleted,
            errors,
            total,
            filePath,
            lastError: errorMessage,
          });
        }
      }),
    ),
    ...filesToDelete.map((filePath) =>
      limit(async () => {
        try {
          if (dryRun) {
            console.log("Dry run: would have deleted", filePath);
          } else {
            await store.deleteFile(storeId, filePath);
          }
          deleted += 1;
          processed += 1;
          onProgress?.({
            processed,
            uploaded,
            deleted,
            errors,
            total,
            filePath,
          });
        } catch (err) {
          processed += 1;
          errors += 1;
          const errorMessage = err instanceof Error ? err.message : String(err);
          onProgress?.({
            processed,
            uploaded,
            deleted,
            errors,
            total,
            filePath,
            lastError: errorMessage,
          });
        }
      }),
    ),
  ]);

  return { processed, uploaded, deleted, errors, total };
}
