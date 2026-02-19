import { mkdirSync } from "node:fs";

/**
 * Standard storage directories available to inference.sh apps at runtime.
 */
export const StorageDir = {
  /** Persistent storage — survives across runs */
  DATA: "/app/data",
  /** Temporary storage — cleaned between runs */
  TEMP: "/app/tmp",
  /** Cache storage — persists across runs, may be evicted */
  CACHE: "/app/cache",
} as const;

export type StorageDirValue = (typeof StorageDir)[keyof typeof StorageDir];

/**
 * Ensure a storage directory exists and return its path.
 *
 * @example
 * ```js
 * import { ensureDir, StorageDir } from "@inferencesh/app";
 *
 * const dataDir = ensureDir(StorageDir.DATA);
 * ```
 */
export function ensureDir(dir: StorageDirValue | string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
