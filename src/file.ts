import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync, copyFileSync, writeFileSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import { homedir } from "node:os";
import { get as httpsGet } from "node:https";
import { get as httpGet, type IncomingMessage } from "node:http";
import { URL } from "node:url";

/**
 * Options for constructing a File.
 */
export interface FileOptions {
  uri?: string;
  path?: string;
  contentType?: string;
  size?: number;
  filename?: string;
}

/**
 * Serialized File representation — what the engine sees in task output.
 */
export interface FileData {
  uri?: string;
  path?: string;
  content_type?: string;
  size?: number;
  filename?: string;
}

/**
 * A file in the inference.sh ecosystem.
 *
 * Accepts a URL, local path, or options object.
 * URLs are downloaded lazily when `getPath()` is called.
 * Local paths are resolved to absolute paths.
 *
 * For API wrapper apps that only need to forward the URL, use `uri` directly
 * without calling `getPath()` to avoid unnecessary downloads.
 *
 * In JSON output, File serializes to `{ path, uri, content_type, size, filename }`
 * — the engine uploads local `path` files to CDN and replaces with `uri`.
 */
export class File {
  uri?: string;
  contentType?: string;
  size?: number;
  filename?: string;

  private _path?: string;
  private _resolved = false;
  private _downloading?: Promise<string>;

  private constructor(options: FileOptions) {
    this.uri = options.uri;
    this._path = options.path;
    this.contentType = options.contentType;
    this.size = options.size;
    this.filename = options.filename;
  }

  /**
   * Get the local file path. Downloads the file lazily if needed.
   * For sync access after download, use the `path` getter.
   */
  async getPath(): Promise<string> {
    if (this._resolved && this._path) {
      return this._path;
    }

    // Avoid concurrent downloads
    if (this._downloading) {
      return this._downloading;
    }

    this._downloading = this._resolve();
    try {
      const path = await this._downloading;
      return path;
    } finally {
      this._downloading = undefined;
    }
  }

  /**
   * Sync access to path. Returns undefined if not yet downloaded.
   * Use `getPath()` for lazy downloading.
   */
  get path(): string | undefined {
    return this._path;
  }

  /**
   * Check if the file has been downloaded/resolved.
   */
  get isResolved(): boolean {
    return this._resolved;
  }

  private async _resolve(): Promise<string> {
    if (this._resolved && this._path) {
      return this._path;
    }

    if (this.uri) {
      if (isDataUri(this.uri)) {
        this._decodeDataUri(this.uri);
      } else if (isUrl(this.uri)) {
        await this._downloadUrl(this.uri);
      } else {
        // Treat as local path
        this._path = resolve(this.uri);
      }
    }

    if (this._path) {
      this._path = resolve(this._path);
      this._populateMetadata();
    }

    this._resolved = true;

    if (!this._path) {
      throw new Error("Failed to resolve file path");
    }

    return this._path;
  }

  /**
   * Create a lazy File from a URL or path string.
   * Does NOT download immediately — download happens when `getPath()` is called.
   *
   * Note: This is safe in JS because `getPath()` is async. The Python SDK had to
   * revert to eager download because `.path` is a sync property that blocks the
   * event loop when called from async code (e.g. Playwright + httpx apps).
   *
   * @example
   * ```js
   * const file = File.lazy("https://example.com/image.jpg");
   * console.log(file.uri);  // Available immediately
   * const path = await file.getPath();  // Downloads here
   * ```
   */
  static lazy(input: string): File {
    const file = new File({ uri: input });

    // If it's a local path (not URL or data URI), resolve immediately
    if (!isUrl(input) && !isDataUri(input)) {
      file._path = resolve(input);
      file._resolved = true;
      file._populateMetadata();
    }

    return file;
  }

  /**
   * Create a File from a URL, local path, or options object.
   * URLs are downloaded and cached automatically (eager loading).
   *
   * For lazy loading, use `File.lazy()` instead.
   *
   * @example
   * ```js
   * // From local path
   * const file = await File.from("/tmp/output.png");
   *
   * // From URL (downloads and caches)
   * const file = await File.from("https://example.com/image.jpg");
   *
   * // From options
   * const file = await File.from({ path: "/tmp/output.png", contentType: "image/png" });
   * ```
   */
  static async from(input: string | FileData | FileOptions | File): Promise<File> {
    if (input instanceof File) {
      return new File({
        uri: input.uri,
        path: input._path,
        contentType: input.contentType,
        size: input.size,
        filename: input.filename,
      });
    }

    let options: FileOptions;

    if (typeof input === "string") {
      options = { uri: input };
    } else {
      const data = input as FileData & FileOptions;
      options = {
        uri: data.uri,
        path: data.path,
        contentType: data.content_type ?? data.contentType,
        size: data.size,
        filename: data.filename,
      };
    }

    if (!options.uri && !options.path) {
      throw new Error("Either 'uri' or 'path' must be provided");
    }

    const file = new File(options);

    // Eagerly resolve
    await file.getPath();

    return file;
  }

  /**
   * Create a File from a local path (sync, no download).
   */
  static fromPath(localPath: string): File {
    const absPath = resolve(localPath);
    const file = new File({ path: absPath });
    file._resolved = true;
    file._populateMetadata();
    return file;
  }

  /**
   * Check if the file exists on disk.
   * Note: This checks the current state without triggering download.
   * Use `getPath()` first if you need to ensure the file is downloaded.
   */
  exists(): boolean {
    return this._path != null && existsSync(this._path);
  }

  /**
   * Check if we have a local path (without triggering download).
   */
  isLocal(): boolean {
    return this._path != null;
  }

  /**
   * Re-read metadata (contentType, size, filename) from disk.
   */
  refreshMetadata(): void {
    this._populateMetadata();
  }

  /**
   * Serialize to a plain object for JSON output.
   * The engine reads `path` fields and uploads them to CDN.
   * Note: Uses internal _path to avoid triggering download during serialization.
   */
  toJSON(): FileData {
    const result: FileData = {};
    if (this.uri != null) result.uri = this.uri;
    if (this._path != null) result.path = this._path;
    if (this.contentType != null) result.content_type = this.contentType;
    if (this.size != null) result.size = this.size;
    if (this.filename != null) result.filename = this.filename;
    return result;
  }

  // --- Cache ---

  static getCacheDir(): string {
    const envDir = process.env.FILE_CACHE_DIR;
    const dir = envDir || join(homedir(), ".cache", "inferencesh", "files");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private _getCachePath(url: string): string {
    const parsed = new URL(url);
    let components = parsed.host + parsed.pathname;
    if (parsed.search) components += parsed.search;

    const hash = createHash("sha256").update(components).digest("hex").slice(0, 12);
    const fname = basename(parsed.pathname) || "download";

    const hashDir = join(File.getCacheDir(), hash);
    mkdirSync(hashDir, { recursive: true });
    return join(hashDir, fname);
  }

  // --- Data URI ---

  private _decodeDataUri(uri: string): void {
    const parsed = parseDataUri(uri);

    // Create cache path based on hash
    const hash = createHash("sha256").update(uri).digest("hex").slice(0, 16);
    const cacheDir = join(File.getCacheDir(), "data_uri", hash);

    // Check for existing cached file
    if (existsSync(cacheDir)) {
      const files = readdirSync(cacheDir);
      if (files.length > 0) {
        this._path = join(cacheDir, files[0]);
        this._populateMetadata();
        return;
      }
    }

    // Set content type from data URI
    if (!this.contentType) {
      this.contentType = parsed.mediaType;
    }

    // Write to cache
    mkdirSync(cacheDir, { recursive: true });
    const ext = getExtensionForMimeType(parsed.mediaType);
    const filename = `file${ext}`;
    const cachePath = join(cacheDir, filename);

    writeFileSync(cachePath, parsed.data);
    this._path = cachePath;
    this._populateMetadata();
  }

  // --- Download ---

  private async _downloadUrl(url: string): Promise<void> {
    const cachePath = this._getCachePath(url);

    if (existsSync(cachePath)) {
      this._path = cachePath;
      this._populateMetadata();
      return;
    }

    const tmpPath = cachePath + ".tmp";

    try {
      await downloadToFile(url, tmpPath);
      renameSync(tmpPath, cachePath);
      this._path = cachePath;
      this._populateMetadata();
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      throw new Error(`Failed to download ${url}: ${(err as Error).message}`);
    }
  }

  // --- Metadata ---

  private _populateMetadata(): void {
    if (!this._path || !existsSync(this._path)) return;

    if (!this.contentType) {
      this.contentType = guessContentType(this._path);
    }
    if (this.size == null) {
      try {
        this.size = statSync(this._path).size;
      } catch { /* ignore */ }
    }
    if (!this.filename) {
      this.filename = basename(this._path);
    }
  }
}

// --- Helpers ---

function isUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function isDataUri(s: string): boolean {
  return s.startsWith("data:");
}

interface ParsedDataUri {
  mediaType: string;
  data: Buffer;
}

/**
 * Parse a data URI and return the media type and decoded data.
 *
 * Supports formats:
 * - data:image/jpeg;base64,/9j/4AAQ...
 * - data:text/plain,Hello%20World
 * - data:;base64,SGVsbG8= (defaults to text/plain)
 */
function parseDataUri(uri: string): ParsedDataUri {
  const match = uri.match(/^data:([^;,]*)?(?:;(base64))?,(.*)$/s);
  if (!match) {
    throw new Error("Invalid data URI format");
  }

  const mediaType = match[1] || "text/plain";
  const isBase64 = match[2] === "base64";
  let dataStr = match[3];

  if (isBase64) {
    // Handle URL-safe base64 (- and _ instead of + and /)
    dataStr = dataStr.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const padding = 4 - (dataStr.length % 4);
    if (padding !== 4) {
      dataStr += "=".repeat(padding);
    }
    return { mediaType, data: Buffer.from(dataStr, "base64") };
  } else {
    // URL-encoded data
    return { mediaType, data: Buffer.from(decodeURIComponent(dataStr), "utf-8") };
  }
}

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "application/pdf": ".pdf",
  "application/json": ".json",
  "text/plain": ".txt",
  "text/html": ".html",
  "text/csv": ".csv",
};

function getExtensionForMimeType(mimeType: string): string {
  return EXTENSION_MAP[mimeType] || "";
}

function downloadToFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const getter = parsed.protocol === "https:" ? httpsGet : httpGet;

    const request = getter(url, (response: IncomingMessage) => {
      // Follow redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadToFile(response.headers.location, destPath).then(resolve, reject);
        return;
      }

      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const dir = join(destPath, "..");
      mkdirSync(dir, { recursive: true });

      const stream = createWriteStream(destPath);
      response.pipe(stream);
      stream.on("finish", () => {
        stream.close();
        resolve();
      });
      stream.on("error", reject);
    });

    request.on("error", reject);
  });
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".flac": "audio/flac", ".aac": "audio/aac",
  ".pdf": "application/pdf", ".json": "application/json",
  ".txt": "text/plain", ".csv": "text/csv", ".html": "text/html",
  ".zip": "application/zip", ".tar": "application/x-tar",
  ".gz": "application/gzip",
};

function guessContentType(filePath: string): string | undefined {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext];
}
