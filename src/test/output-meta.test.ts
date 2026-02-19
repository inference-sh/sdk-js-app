import { describe, it } from "node:test";
import assert from "node:assert";
import { textMeta, imageMeta, videoMeta, audioMeta, rawMeta } from "../output-meta.js";
import type { OutputMeta } from "../output-meta.js";

describe("OutputMeta", () => {
  it("creates text meta", () => {
    const meta = textMeta({ tokens: 150 });
    assert.strictEqual(meta.type, "text");
    assert.strictEqual(meta.tokens, 150);
  });

  it("creates image meta", () => {
    const meta = imageMeta({ width: 1024, height: 1024, steps: 20, count: 1 });
    assert.strictEqual(meta.type, "image");
    assert.strictEqual(meta.width, 1024);
    assert.strictEqual(meta.steps, 20);
  });

  it("creates video meta", () => {
    const meta = videoMeta({ resolution: "1080p", seconds: 5.0 });
    assert.strictEqual(meta.type, "video");
    assert.strictEqual(meta.resolution, "1080p");
  });

  it("creates audio meta", () => {
    const meta = audioMeta({ seconds: 30.0 });
    assert.strictEqual(meta.type, "audio");
    assert.strictEqual(meta.seconds, 30.0);
  });

  it("creates raw meta", () => {
    const meta = rawMeta({ cost: 0.5 });
    assert.strictEqual(meta.type, "raw");
    assert.strictEqual(meta.cost, 0.5);
  });

  it("supports extra data", () => {
    const meta = imageMeta({ width: 512, height: 512, extra: { model: "sdxl" } });
    assert.strictEqual(meta.extra?.model, "sdxl");
  });

  it("composes into OutputMeta", () => {
    const output: OutputMeta = {
      inputs: [textMeta({ tokens: 100 })],
      outputs: [textMeta({ tokens: 500 }), imageMeta({ width: 1024, height: 1024 })],
    };
    assert.strictEqual(output.inputs!.length, 1);
    assert.strictEqual(output.outputs!.length, 2);
    // Serializes cleanly
    const json = JSON.stringify(output);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.inputs[0].type, "text");
    assert.strictEqual(parsed.outputs[1].type, "image");
  });
});
