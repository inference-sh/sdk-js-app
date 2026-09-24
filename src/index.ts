// File handling
export { File } from "./file.js";
export type { FileOptions, FileData } from "./file.js";

// Zod schema utilities
export { createFileSchema, isFileSchema, FILE_SCHEMA_MARKER } from "./schema.js";

// Stream functions: the socket and live fields
export type { Socket, Frame } from "./socket.js";
export {
  createStreamSchema,
  media,
  pcm16,
  Live,
  liveFields,
  binaryField,
  STREAM_SCHEMA_MARKER,
  CLEAR_KEY,
  BINARY_SCHEMA_MARKER,
} from "./stream.js";
export type { Update } from "./stream.js";

// Storage directories
export { StorageDir, ensureDir } from "./storage.js";
export type { StorageDirValue } from "./storage.js";

// Download utility
export { download } from "./download.js";

// Runtime metadata passed to app setup and run methods
export type { RequestMetadata, RequestMetadata as Metadata } from "./types.js";

// Output metadata for usage-based pricing
// (includes generated types + factory functions)
export * from "./output-meta.js";
