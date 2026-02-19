import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { File } from "./file.js";
import { StorageDir, type StorageDirValue } from "./storage.js";

/**
 * Download a file to a directory and return its local path.
 *
 * Uses the same cache as `File.from()`. If the file already exists in the
 * target directory (and it's not TEMP), returns the cached copy.
 *
 * @example
 * ```js
 * import { download, StorageDir } from "@inferencesh/app";
 *
 * const path = await download("https://example.com/model.bin", StorageDir.CACHE);
 * ```
 */
export async function download(
  url: string,
  directory: StorageDirValue | string,
): Promise<string> {
  const dirPath = directory as string;
  mkdirSync(dirPath, { recursive: true });

  // Build output path with hash subdirectory (matches Python SDK)
  const parsed = new URL(url);
  let components = parsed.host + parsed.pathname;
  if (parsed.search) components += parsed.search;
  const hash = createHash("sha256").update(components).digest("hex").slice(0, 12);
  const filename = basename(parsed.pathname) || "download";

  const hashDir = join(dirPath, hash);
  mkdirSync(hashDir, { recursive: true });
  const outputPath = join(hashDir, filename);

  // Skip download if already in target directory (unless TEMP)
  if (existsSync(outputPath) && directory !== StorageDir.TEMP) {
    return outputPath;
  }

  // Download via File (uses File's own cache)
  const file = await File.from(url);
  if (file.path) {
    copyFileSync(file.path, outputPath);
    return outputPath;
  }

  throw new Error(`Failed to download ${url}`);
}
