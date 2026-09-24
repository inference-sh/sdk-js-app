/**
 * Zod schema utilities for inference.sh apps.
 *
 * Provides a `fileSchema` that:
 * - Accepts URL strings as input
 * - Transforms to lazy File objects (no download until getPath() called)
 * - Generates JSON Schema with format: "file"
 */

import { File } from "./file.js";
import { findMarker } from "./zod-walk.js";

// We don't import zod directly to avoid version conflicts.
// Instead, apps provide their own zod and we work with the schema structure.

/**
 * Symbol to mark a schema as a file schema.
 * The kernel's zodToJsonSchema will detect this and output format: "file".
 */
export const FILE_SCHEMA_MARKER = Symbol.for("inferencesh.fileSchema");

/**
 * Create a file schema using the app's Zod instance.
 *
 * @example
 * ```js
 * import { z } from "zod";
 * import { createFileSchema } from "@inferencesh/app";
 *
 * const fileSchema = createFileSchema(z);
 *
 * const InputSchema = z.object({
 *   image: fileSchema.describe("Input image"),
 * });
 * ```
 */
export function createFileSchema(z: any) {
  const schema = z.string().transform((uri: string) => File.lazy(uri));

  // Mark as file schema for JSON schema generation
  schema._def[FILE_SCHEMA_MARKER] = true;

  return schema;
}

/**
 * Check if a Zod schema is a file schema (created by createFileSchema),
 * through any wrapper (optional, default, nullable, ...) in zod v3 or v4.
 */
export function isFileSchema(schema: any): boolean {
  return findMarker(schema, FILE_SCHEMA_MARKER) === true;
}
