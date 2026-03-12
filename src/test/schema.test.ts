/**
 * Tests for Zod schema integration and JSON schema generation.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { File } from "../file.js";
import { createFileSchema, isFileSchema, FILE_SCHEMA_MARKER } from "../schema.js";

// Import zod (devDependency)
import { z } from "zod";

const TEST_DIR = join(tmpdir(), "inferencesh-schema-test-" + Date.now());
let testFile: string;

describe("createFileSchema", () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    testFile = join(TEST_DIR, "test.txt");
    writeFileSync(testFile, "test content");
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates a schema that transforms strings to File", () => {
    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      image: fileSchema,
    });

    // Parse with a URL
    const result = InputSchema.parse({ image: "https://example.com/image.jpg" });

    // Should be a File instance
    assert.ok(result.image instanceof File);
    assert.strictEqual(result.image.uri, "https://example.com/image.jpg");

    // Should be lazy (not resolved)
    assert.strictEqual(result.image.isResolved, false);
  });

  it("creates a schema that transforms local paths to File", () => {
    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      image: fileSchema,
    });

    // Parse with a local path
    const result = InputSchema.parse({ image: testFile });

    // Should be a File instance
    assert.ok(result.image instanceof File);

    // Should be resolved (local paths resolve immediately)
    assert.strictEqual(result.image.isResolved, true);
    assert.ok(result.image.path);
  });

  it("schema is marked as file schema", () => {
    const fileSchema = createFileSchema(z);

    // Check marker
    assert.strictEqual(fileSchema._def[FILE_SCHEMA_MARKER], true);
  });

  it("isFileSchema detects file schemas", () => {
    const fileSchema = createFileSchema(z);
    const stringSchema = z.string();
    const numberSchema = z.number();

    assert.strictEqual(isFileSchema(fileSchema), true);
    assert.strictEqual(isFileSchema(stringSchema), false);
    assert.strictEqual(isFileSchema(numberSchema), false);
  });

  it("isFileSchema returns false for non-schemas", () => {
    assert.strictEqual(isFileSchema(null), false);
    assert.strictEqual(isFileSchema(undefined), false);
    assert.strictEqual(isFileSchema("string"), false);
    assert.strictEqual(isFileSchema(123), false);
    assert.strictEqual(isFileSchema({}), false);
  });

  it("file schema works with optional", () => {
    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      image: fileSchema.optional(),
    });

    // Parse without image
    const result1 = InputSchema.parse({});
    assert.strictEqual(result1.image, undefined);

    // Parse with image
    const result2 = InputSchema.parse({ image: "https://example.com/image.jpg" });
    assert.ok(result2.image instanceof File);
  });

  it("file schema works with default (returns string, not File)", () => {
    // NOTE: Zod's .default() does NOT run transforms on the default value.
    // This is expected Zod behavior - defaults are inserted before parsing.
    // For file inputs with defaults, the app should handle both File and string.
    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      image: fileSchema.default("https://example.com/default.jpg"),
    });

    // Parse without image - gets default (as string, not transformed)
    const result = InputSchema.parse({});
    // Default is a string, not a File (Zod doesn't transform defaults)
    assert.strictEqual(result.image, "https://example.com/default.jpg");

    // Parse WITH image - gets transformed to File
    const result2 = InputSchema.parse({ image: "https://example.com/image.jpg" });
    assert.ok(result2.image instanceof File);
    assert.strictEqual(result2.image.uri, "https://example.com/image.jpg");
  });

  it("file schema works in arrays", () => {
    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      images: z.array(fileSchema),
    });

    const result = InputSchema.parse({
      images: [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg",
      ],
    });

    assert.strictEqual(result.images.length, 2);
    assert.ok(result.images[0] instanceof File);
    assert.ok(result.images[1] instanceof File);
    assert.strictEqual(result.images[0].uri, "https://example.com/image1.jpg");
    assert.strictEqual(result.images[1].uri, "https://example.com/image2.jpg");
  });
});

describe("zodToJsonSchema file support", () => {
  // Import the kernel's zodToJsonSchema to test it recognizes file schemas
  let zodToJsonSchema: ((schema: any) => any) | undefined;

  before(async () => {
    try {
      // Path relative to test file location - use dynamic import
      // @ts-ignore - importing JS file without declarations
      const utils = await import("../../../../go/visor/kernels/node/tools/zod-utils.js");
      zodToJsonSchema = utils.zodToJsonSchema;
    } catch (e) {
      console.log("Could not import zod-utils, skipping zodToJsonSchema tests:", e);
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("generates format: file for file schema", async () => {
    if (!zodToJsonSchema) {
      console.log("  - skipped: zod-utils not available");
      return;
    }

    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      image: fileSchema.describe("Input image"),
    });

    const jsonSchema = zodToJsonSchema(InputSchema);

    assert.strictEqual(jsonSchema.type, "object");
    assert.ok(jsonSchema.properties);
    assert.ok(jsonSchema.properties.image);

    const imageSchema = jsonSchema.properties.image;
    assert.strictEqual(imageSchema.type, "string");
    assert.strictEqual(imageSchema.format, "file");
    assert.strictEqual(imageSchema.description, "Input image");
  });

  it("generates format: file in arrays", async () => {
    if (!zodToJsonSchema) {
      console.log("  - skipped: zod-utils not available");
      return;
    }

    const fileSchema = createFileSchema(z);
    const InputSchema = z.object({
      images: z.array(fileSchema).describe("Multiple images"),
    });

    const jsonSchema = zodToJsonSchema(InputSchema);

    const imagesSchema = jsonSchema.properties.images;
    assert.strictEqual(imagesSchema.type, "array");
    assert.ok(imagesSchema.items);
    assert.strictEqual(imagesSchema.items.type, "string");
    assert.strictEqual(imagesSchema.items.format, "file");
  });

  it("regular string schema does not get format: file", async () => {
    if (!zodToJsonSchema) {
      console.log("  - skipped: zod-utils not available");
      return;
    }

    const InputSchema = z.object({
      name: z.string().describe("User name"),
    });

    const jsonSchema = zodToJsonSchema(InputSchema);

    const nameSchema = jsonSchema.properties.name;
    assert.strictEqual(nameSchema.type, "string");
    assert.strictEqual(nameSchema.format, undefined);
  });
});
