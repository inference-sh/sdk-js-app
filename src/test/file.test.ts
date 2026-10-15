import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, statSync, utimesSync, unlinkSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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

  it("a failed resolve leaves the file unresolved", async () => {
    // Neither uri nor path: the public factories refuse this, so reach the
    // private constructor to exercise the guard in _resolve().
    const Ctor = File as unknown as new (options: object) => File;
    const file = new Ctor({});

    await assert.rejects(file.getPath(), /Failed to resolve file path/);
    assert.strictEqual(file.isResolved, false);
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

// The engine expires cached inputs by mtime, so reuse refreshes it.
describe("File cache last use", () => {
  const CACHE_DIR = join(tmpdir(), `infsh-cache-test-${process.pid}`);
  let server: Server;
  let url: string;
  let body = "fetched";
  let fetches = 0;

  before(async () => {
    process.env.FILE_CACHE_DIR = CACHE_DIR;
    server = createServer((_req, res) => {
      fetches++;
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/inputs/image.png`;
  });

  after(() => {
    server.close();
    delete process.env.FILE_CACHE_DIR;
    rmSync(CACHE_DIR, { recursive: true, force: true });
  });

  const age = (path: string): number => {
    const old = statSync(path).mtimeMs / 1000 - 48 * 3600;
    utimesSync(path, old, old);
    return old * 1000;
  };

  it("reuse refreshes the mtime", async () => {
    const path = await (await File.from(url)).getPath();
    const old = age(path);
    const fetchesBefore = fetches;

    assert.strictEqual(await (await File.from(url)).getPath(), path);
    assert.strictEqual(fetches, fetchesBefore);
    assert.ok(statSync(path).mtimeMs > old);
  });

  it("an expired input downloads again", async () => {
    const path = await (await File.from(url)).getPath();
    unlinkSync(path);
    body = "again";
    const fetchesBefore = fetches;

    assert.strictEqual(await (await File.from(url)).getPath(), path);
    assert.strictEqual(fetches, fetchesBefore + 1);
    assert.strictEqual(readFileSync(path, "utf8"), "again");
  });

  it("data URI reuse refreshes the mtime", async () => {
    const uri = "data:text/plain,hello";
    const path = await (await File.from(uri)).getPath();
    const old = age(path);

    assert.strictEqual(await (await File.from(uri)).getPath(), path);
    assert.ok(statSync(path).mtimeMs > old);
  });
});

// downloadToFile must consume redirect and error bodies, or the socket stays
// held: the server can never finish writing a body larger than the socket
// buffers.
describe("File download drains unused responses", () => {
  const CACHE_DIR = join(tmpdir(), `infsh-drain-test-${process.pid}`);
  const BIG = Buffer.alloc(8 * 1024 * 1024, 120);
  let server: Server;
  let base: string;
  const finished = new Map<string, Promise<void>>();

  before(async () => {
    process.env.FILE_CACHE_DIR = CACHE_DIR;
    server = createServer((req, res) => {
      finished.set(req.url ?? "", new Promise<void>((resolve) => res.on("finish", resolve)));
      if (req.url?.startsWith("/redirect")) {
        res.writeHead(302, { Location: `${base}/ok.txt` });
        res.end(BIG);
      } else if (req.url?.startsWith("/missing")) {
        res.writeHead(404);
        res.end(BIG);
      } else {
        res.end("ok");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.closeAllConnections();
    server.close();
    delete process.env.FILE_CACHE_DIR;
    rmSync(CACHE_DIR, { recursive: true, force: true });
  });

  const drainedWithin = (path: string, ms: number): Promise<boolean> =>
    Promise.race([
      finished.get(path)!.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms).unref()),
    ]);

  it("drains the body of a redirect", async () => {
    const path = await (await File.from(`${base}/redirect/a.txt`)).getPath();
    assert.strictEqual(readFileSync(path, "utf8"), "ok");
    assert.strictEqual(await drainedWithin("/redirect/a.txt", 2000), true);
  });

  it("drains the body of an HTTP error", async () => {
    await assert.rejects(File.from(`${base}/missing/b.txt`), /HTTP 404/);
    assert.strictEqual(await drainedWithin("/missing/b.txt", 2000), true);
  });
});
