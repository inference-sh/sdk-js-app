/**
 * Tests for live fields: schema shape, request-body parsing, and the frame
 * mapping. Run against both the app's possible zod instances (v4 and v3).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import type { Socket, Frame } from "../socket.js";
import {
  createStreamSchema,
  media,
  pcm16,
  Live,
  liveFields,
  binaryField,
  STREAM_SCHEMA_MARKER,
  BINARY_SCHEMA_MARKER,
} from "../stream.js";

// The app's zod: v4 (devDependency "zod") and v3 (devDependency alias "zod3").
import { z as z4 } from "zod";
// @ts-ignore - alias package, typed loosely on purpose
import { z as z3 } from "zod3";

class FakeSocket implements Socket {
  readonly id = "fake";
  metadata: Record<string, unknown> = {};
  closed = false;
  readonly dropped = 0;
  binaryBacklog: number | null = 256;
  sent: unknown[] = [];
  private frames: Frame[];

  constructor(frames: Frame[]) {
    this.frames = [...frames];
  }

  async recv(): Promise<Frame | null> {
    return this.frames.shift() ?? null;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Frame> {
    while (this.frames.length > 0) yield this.frames.shift()!;
  }

  async send(data: Buffer | Uint8Array | ArrayBuffer | string | object): Promise<void> {
    this.sent.push(data);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

async function collect(live: Live) {
  const out: { field: string; value: unknown }[] = [];
  for await (const u of live) out.push(u);
  return out;
}

for (const [label, z] of [
  ["zod v4", z4],
  ["zod v3", z3],
] as [string, any][]) {
  describe(`live fields (${label})`, () => {
    const Interrupt = z.object({ type: z.literal("interrupt") });
    const UserText = z.object({ type: z.literal("text"), text: z.string() });

    const TalkInput = z.object({
      voice: z.enum(["ara", "eve"]).default("ara"),
      gain: z.coerce.number().default(1),
      audio: createStreamSchema(z, pcm16(z, 16000)),
      events: createStreamSchema(z, z.union([Interrupt, UserText])),
    });

    const Word = z.object({ text: z.string(), final: z.boolean().default(false) });

    const TalkOutput = z.object({
      audio: createStreamSchema(z, pcm16(z, 24000)),
      transcript: createStreamSchema(z, Word),
      voice: z.string().default("ara"),
      seconds: z.number().default(0),
    });

    it("parses to the placeholder [] and accepts a missing key", () => {
      assert.deepStrictEqual(TalkInput.parse({ voice: "eve" }), { voice: "eve", gain: 1, audio: [], events: [] });
      const got = TalkInput.parse({ voice: "eve", audio: ["whatever"], events: [{ type: "interrupt" }] });
      assert.deepStrictEqual(got.audio, []);
      assert.deepStrictEqual(got.events, []);
    });

    it("carries the markers, also after .describe()", () => {
      const item = pcm16(z, 8000, 2);
      assert.strictEqual(item._def[BINARY_SCHEMA_MARKER], "audio/pcm;format=s16le;rate=8000;channels=2");
      assert.strictEqual(media(z, "image/jpeg")._def[BINARY_SCHEMA_MARKER], "image/jpeg");

      const stream = createStreamSchema(z, item);
      assert.strictEqual(stream._def[STREAM_SCHEMA_MARKER], item);
      assert.strictEqual(stream.describe("mic")._def[STREAM_SCHEMA_MARKER], item);
      assert.strictEqual(item.describe("pcm")._def[BINARY_SCHEMA_MARKER], "audio/pcm;format=s16le;rate=8000;channels=2");
    });

    it("media items accept Buffers and Uint8Arrays, refuse strings", () => {
      const item = media(z, "image/jpeg");
      assert.ok(item.safeParse(Buffer.from([1])).success);
      assert.ok(item.safeParse(new Uint8Array(2)).success);
      assert.strictEqual(item.safeParse("base64?").success, false);
    });

    it("finds live fields and the one binary field", () => {
      assert.deepStrictEqual(Object.keys(liveFields(TalkInput)), ["audio", "events"]);
      assert.strictEqual(binaryField(TalkInput), "audio");
      assert.strictEqual(binaryField(z.object({ events: createStreamSchema(z, UserText) })), null);

      const TwoBinaries = z.object({
        mic: createStreamSchema(z, pcm16(z)),
        cam: createStreamSchema(z, media(z, "image/jpeg")),
      });
      assert.throws(() => binaryField(TwoBinaries), /one per direction/);
    });

    it("finds a live field through optional/nullable/default/describe wrappers", () => {
      const Opt = z.object({
        audio: createStreamSchema(z, pcm16(z)).optional().describe("mic"),
        events: createStreamSchema(z, UserText).nullable().default(null),
      });
      assert.deepStrictEqual(Object.keys(liveFields(Opt)), ["audio", "events"]);
      assert.strictEqual(binaryField(Opt), "audio");
      // a wrapped live field keeps the wrapper's own missing-key behaviour
      assert.deepStrictEqual(Opt.parse({}), { events: null });
      assert.deepStrictEqual(Opt.parse({ audio: ["junk"], events: [1] }), { audio: [], events: [] });
    });

    it("maps frames to fields", async () => {
      const socket = new FakeSocket([
        Buffer.from([1, 2]),
        JSON.stringify({ events: { type: "text", text: "hi" } }),
        JSON.stringify({ voice: "eve", gain: "2.5" }),
        JSON.stringify({ events: { type: "interrupt" } }),
      ]);
      const data = TalkInput.parse({});

      const updates = await collect(new Live(socket, data, TalkInput, TalkOutput));

      assert.strictEqual(updates.length, 5);
      assert.strictEqual(updates[0].field, "audio");
      assert.ok(Buffer.isBuffer(updates[0].value));
      assert.deepStrictEqual([...(updates[0].value as Buffer)], [1, 2]);
      assert.deepStrictEqual(updates[1], { field: "events", value: { type: "text", text: "hi" } });
      assert.deepStrictEqual(updates[2], { field: "voice", value: "eve" });
      assert.deepStrictEqual(updates[3], { field: "gain", value: 2.5 });
      assert.deepStrictEqual(updates[4], { field: "events", value: { type: "interrupt" } });
      // Ordinary fields are applied to the input data, validated and coerced.
      assert.strictEqual(data.voice, "eve");
      assert.strictEqual(data.gain, 2.5);
      assert.deepStrictEqual(socket.sent, []);
    });

    it("answers frames that do not fit and goes on", async () => {
      const socket = new FakeSocket([
        JSON.stringify({ voice: "nobody" }),
        JSON.stringify({ nope: 1 }),
        "not json",
        JSON.stringify([1, 2]),
        JSON.stringify({ audio: "base64?" }),
        JSON.stringify({ events: { type: "text" } }),
        Buffer.from([0]),
      ]);
      const data = TalkInput.parse({});

      const updates = await collect(new Live(socket, data, TalkInput, TalkOutput));

      assert.strictEqual(updates.length, 1, "the stream goes on after bad frames");
      assert.strictEqual(updates[0].field, "audio");
      assert.strictEqual(data.voice, "ara", "a refused value is not applied");
      const errors = socket.sent as { error: { field: string | null; message: string } }[];
      assert.deepStrictEqual(
        errors.map((e) => e.error.field),
        ["voice", "nope", null, null, "audio", "events"],
      );
      assert.ok(errors.every((e) => typeof e.error.message === "string" && e.error.message.length > 0));
      assert.strictEqual(errors[1].error.message, "no such field");
      assert.strictEqual(errors[2].error.message, "a text frame is a JSON object keyed by field name");
      assert.strictEqual(errors[4].error.message, "send this field's items as binary frames");
    });

    it("refuses binary frames when the input has no binary field", async () => {
      const TextOnly = z.object({ events: createStreamSchema(z, UserText) });
      const socket = new FakeSocket([Buffer.from([0]), Buffer.from([1]), Buffer.from([2])]);

      const updates = await collect(new Live(socket, {}, TextOnly, TalkOutput));

      assert.deepStrictEqual(updates, []);
      // Once, not once per frame: a mic streaming to the wrong function sends 50 a second.
      assert.deepStrictEqual(socket.sent, [{ error: { field: null, message: "this function takes no binary frames" } }]);
    });

    it("reads through recv() when the socket has no async iterator", async () => {
      const socket = new FakeSocket([Buffer.from([7])]);
      const plain = { recv: () => socket.recv(), send: (d: unknown) => socket.send(d as object) } as unknown as Socket;

      const updates = await collect(new Live(plain, {}, TalkInput, TalkOutput));

      assert.strictEqual(updates.length, 1);
      assert.deepStrictEqual([...(updates[0].value as Buffer)], [7]);
    });

    it("clear() tells the caller to drop a live output field", async () => {
      const socket = new FakeSocket([]);
      const live = new Live(socket, {}, TalkInput, TalkOutput);

      await live.clear("audio");
      await assert.rejects(live.clear("voice"), /no live field "voice"/);

      assert.deepStrictEqual(socket.sent, [{ $clear: "audio" }]);
    });

    it("send() routes the binary field to a binary frame and the rest to one JSON frame", async () => {
      const socket = new FakeSocket([]);
      const live = new Live(socket, {}, TalkInput, TalkOutput);

      await live.send({ audio: Buffer.from([9, 8]) });
      await live.send({ audio: new Uint8Array([7]) });
      await live.send({ transcript: { text: "hello", final: true } });
      await live.send({ voice: "eve", seconds: 2 });
      await live.send({ audio: Buffer.from([1]), seconds: 3 });
      await assert.rejects(live.send({ nonsense: 1 }), /no field "nonsense"/);
      await assert.rejects(live.send({ audio: "not bytes" }), TypeError);

      assert.strictEqual(socket.sent.length, 6);
      assert.ok(Buffer.isBuffer(socket.sent[0]));
      assert.deepStrictEqual([...(socket.sent[0] as Buffer)], [9, 8]);
      assert.ok(Buffer.isBuffer(socket.sent[1]));
      assert.deepStrictEqual([...(socket.sent[1] as Buffer)], [7]);
      assert.deepStrictEqual(socket.sent[2], { transcript: { text: "hello", final: true } });
      assert.deepStrictEqual(socket.sent[3], { voice: "eve", seconds: 2 });
      assert.deepStrictEqual([...(socket.sent[4] as Buffer)], [1]);
      assert.deepStrictEqual(socket.sent[5], { seconds: 3 });
    });
  });
}
