import { describe, it, before, after } from "node:test";
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
