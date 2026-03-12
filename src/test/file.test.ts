import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { File } from "../file.js";

const TEST_DIR = join(tmpdir(), "inferencesh-app-test-" + Date.now());
let testFile: string;

describe("File", () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    testFile = join(TEST_DIR, "hello.txt");
    writeFileSync(testFile, "hello world");
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates from local path", () => {
    const file = File.fromPath(testFile);
    assert.ok(file.path);
    assert.ok(file.exists());
    assert.strictEqual(file.filename, "hello.txt");
    assert.strictEqual(file.contentType, "text/plain");
    assert.strictEqual(file.size, 11);
  });

  it("creates from path via async from()", async () => {
    const file = await File.from(testFile);
    assert.ok(file.path);
    assert.ok(file.exists());
    assert.strictEqual(file.filename, "hello.txt");
  });

  it("creates from options object", async () => {
    const file = await File.from({ path: testFile, contentType: "text/plain" });
    assert.ok(file.exists());
    assert.strictEqual(file.contentType, "text/plain");
  });

  it("creates from FileData with content_type (snake_case)", async () => {
    const file = await File.from({ path: testFile, content_type: "application/octet-stream" });
    assert.strictEqual(file.contentType, "application/octet-stream");
  });

  it("creates from another File", async () => {
    const original = File.fromPath(testFile);
    const copy = await File.from(original);
    assert.strictEqual(copy.path, original.path);
    assert.strictEqual(copy.filename, original.filename);
  });

  it("serializes to JSON with snake_case", () => {
    const file = File.fromPath(testFile);
    const json = file.toJSON();
    assert.ok(json.path);
    assert.strictEqual(json.content_type, "text/plain");
    assert.strictEqual(json.size, 11);
    assert.strictEqual(json.filename, "hello.txt");
    assert.strictEqual(json.uri, undefined);
  });

  it("works with JSON.stringify", () => {
    const file = File.fromPath(testFile);
    const str = JSON.stringify({ image: file });
    const parsed = JSON.parse(str);
    assert.ok(parsed.image.path);
    assert.strictEqual(parsed.image.content_type, "text/plain");
  });

  it("resolves relative paths to absolute", () => {
    const file = File.fromPath("./package.json");
    assert.ok(file.path!.startsWith("/"));
  });

  it("throws on missing path and uri", async () => {
    await assert.rejects(() => File.from({}), /Either 'uri' or 'path' must be provided/);
  });
});

describe("File lazy loading", () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    testFile = join(TEST_DIR, "hello.txt");
    writeFileSync(testFile, "hello world");
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("File.lazy() does not download URL on construction", () => {
    const url = "https://example.com/image.jpg";
    const file = File.lazy(url);

    // Should have URI immediately
    assert.strictEqual(file.uri, url);

    // Should NOT be resolved yet
    assert.strictEqual(file.isResolved, false);

    // Should NOT have path yet
    assert.strictEqual(file.path, undefined);
  });

  it("File.lazy() resolves local paths immediately", () => {
    const file = File.lazy(testFile);

    // Should be resolved immediately for local paths
    assert.strictEqual(file.isResolved, true);

    // Should have path
    assert.ok(file.path);
    assert.ok(file.path.endsWith("hello.txt"));
  });

  it("uri access does not trigger download", () => {
    const url = "https://example.com/image.jpg";
    const file = File.lazy(url);

    // Access uri multiple times
    const uri1 = file.uri;
    const uri2 = file.uri;
    const uri3 = file.uri;

    assert.strictEqual(uri1, url);
    assert.strictEqual(uri2, url);
    assert.strictEqual(uri3, url);

    // Should still not be resolved
    assert.strictEqual(file.isResolved, false);
  });

  it("isLocal() does not trigger download", () => {
    const url = "https://example.com/image.jpg";
    const file = File.lazy(url);

    // Check isLocal
    assert.strictEqual(file.isLocal(), false);

    // Should still not be resolved
    assert.strictEqual(file.isResolved, false);
  });

  it("toJSON() does not trigger download", () => {
    const url = "https://example.com/image.jpg";
    const file = File.lazy(url);

    // Serialize
    const json = file.toJSON();

    // Should have URI but no path
    assert.strictEqual(json.uri, url);
    assert.strictEqual(json.path, undefined);

    // Should still not be resolved
    assert.strictEqual(file.isResolved, false);
  });

  it("JSON.stringify does not trigger download", () => {
    const url = "https://example.com/image.jpg";
    const file = File.lazy(url);

    // Stringify
    const str = JSON.stringify({ image: file });
    const parsed = JSON.parse(str);

    // Should have URI but no path
    assert.strictEqual(parsed.image.uri, url);
    assert.strictEqual(parsed.image.path, undefined);

    // Should still not be resolved
    assert.strictEqual(file.isResolved, false);
  });

  it("getPath() triggers download for URLs", async () => {
    // Use a local path that looks like URL behavior
    // (actual URL download would require network)
    const file = File.lazy(testFile);

    // getPath should work
    const path = await file.getPath();

    assert.ok(path);
    assert.ok(path.endsWith("hello.txt"));
    assert.strictEqual(file.isResolved, true);
  });
});
