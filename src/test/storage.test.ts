import { describe, it } from "node:test";
import assert from "node:assert";
import { StorageDir } from "../storage.js";

describe("StorageDir", () => {
  it("has correct paths", () => {
    assert.strictEqual(StorageDir.DATA, "/app/data");
    assert.strictEqual(StorageDir.TEMP, "/app/tmp");
    assert.strictEqual(StorageDir.CACHE, "/app/cache");
  });
});
