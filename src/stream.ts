/**
 * Live fields: input and output that flow over a stream function's socket.
 *
 * A stream function's input is still its input schema. Some of its fields are
 * live: their values arrive over the socket while the task runs, instead of in
 * the request body. The output schema works the same way in the other
 * direction:
 *
 * ```js
 * const TalkInput = z.object({
 *   voice: z.enum(["ara", "eve"]).default("ara"),          // ordinary: set at the start
 *   audio: createStreamSchema(z, pcm16(z, 16000)),         // live media
 *   events: createStreamSchema(z, z.union([Interrupt, UserText])), // live typed messages
 * });
 *
 * const TalkOutput = z.object({
 *   audio: createStreamSchema(z, pcm16(z, 24000)),
 *   seconds: z.number().default(0),
 * });
 * ```
 *
 * In the JSON schema a live field is an array delivered over time, marked
 * `"format": "stream"` the way a file field is marked `"format": "file"`:
 *
 * ```json
 * "audio": {"type": "array", "format": "stream",
 *           "items": {"type": "string", "format": "binary",
 *                     "contentMediaType": "audio/pcm;format=s16le;rate=16000;channels=1"}}
 * ```
 *
 * Live fields are never required, so the request body is the ordinary fields
 * only. File and stream fields are siblings: the same media, by reference or
 * live.
 *
 * On the wire:
 *
 * - a binary frame is one item of the schema's binary live field (a schema has
 *   at most one per direction, because a binary frame carries no field name);
 * - a JSON text frame is a partial object of the schema keyed by field name:
 *   `{"events": {"type": "interrupt"}}` is one item of a live field, and
 *   `{"voice": "eve"}` changes an ordinary field while the task runs.
 *
 * `Live` applies that mapping to a socket, with the schemas as the contract.
 *
 * Zod is never imported: the app's own zod (v3 or v4) is passed in, and the
 * schemas are read by duck-typing `_def`, the same way the kernel does.
 */

import type { Socket } from "./socket.js";
import { findMarker } from "./zod-walk.js";

/**
 * Marks a live field's schema. The value on `_def` is the item schema.
 * The kernel's zodToJsonSchema reads this and emits `format: "stream"`.
 */
export const STREAM_SCHEMA_MARKER = Symbol.for("inferencesh.streamSchema");

// Control frames. Reserved keys start with `$`, which no field name can, so a
// control frame is never mistaken for an output field.

/** `{"$clear": "audio"}`: drop what has been buffered of a live output field. */
export const CLEAR_KEY = "$clear";
/**
 * `{"$error": {"field": ..., "message": ...}}`: a refused frame, or anything
 * else the caller should be told went wrong. The stream goes on.
 */
export const ERROR_KEY = "$error";

/**
 * Marks a binary item schema. The value on `_def` is the content type.
 * The kernel's zodToJsonSchema reads this and emits
 * `{type: "string", format: "binary", contentMediaType}`.
 */
export const BINARY_SCHEMA_MARKER = Symbol.for("inferencesh.binarySchema");

/**
 * A field whose values travel over the socket while the task runs.
 *
 * Parsing always yields the placeholder `[]`, whatever the caller put in the
 * request body (items come over the socket), and a missing key parses too.
 * Read and write the items with `Live`.
 *
 * @param z the app's zod instance
 * @param item the schema of one item (`pcm16(z)`, `media(z, "image/jpeg")`, or any zod schema)
 */
export function createStreamSchema(z: any, item: any): any {
  const schema = z.preprocess(() => [], z.array(item));
  schema._def[STREAM_SCHEMA_MARKER] = item;
  return schema;
}

/**
 * Binary items of a media type, e.g. `createStreamSchema(z, media(z, "image/jpeg"))`.
 * Accepts a Buffer or any Uint8Array.
 */
export function media(z: any, contentType: string): any {
  const schema = z.custom((v: unknown) => v instanceof Uint8Array, {
    message: "expected binary data",
  });
  schema._def[BINARY_SCHEMA_MARKER] = contentType;
  return schema;
}

/**
 * Raw 16-bit little-endian PCM audio. One frame is one chunk of samples;
 * 20 ms (`rate / 50` samples) is the usual size for live audio.
 */
export function pcm16(z: any, rate = 16000, channels = 1): any {
  return media(z, `audio/pcm;format=s16le;rate=${rate};channels=${channels}`);
}

/**
 * One thing the caller sent: an item of a live field, or a new value for an
 * ordinary field (already applied to the input data).
 */
export interface Update {
  field: string;
  value: unknown;
}

// --- schema walking (zod v3 and v4 `_def` shapes) ---------------------------



/** The fields of a zod object schema. v3: `_def.shape()`, v4: `_def.shape`. */
function shapeOf(objectSchema: any): Record<string, any> {
  const def = objectSchema?._def;
  if (!def) throw new TypeError("expected a zod object schema");
  const shape = typeof def.shape === "function" ? def.shape() : def.shape;
  if (!shape || typeof shape !== "object") throw new TypeError("expected a zod object schema");
  return shape;
}

function isBinaryItem(item: any): boolean {
  return typeof findMarker(item, BINARY_SCHEMA_MARKER) === "string";
}

/** The object schema's live fields and their item schemas. */
export function liveFields(objectSchema: any): Record<string, any> {
  const found: Record<string, any> = {};
  for (const [name, field] of Object.entries(shapeOf(objectSchema))) {
    const item = findMarker(field, STREAM_SCHEMA_MARKER);
    if (item !== undefined) found[name] = item;
  }
  return found;
}

/**
 * The object schema's binary live field, or null. More than one is an error:
 * a binary frame carries no field name.
 */
export function binaryField(objectSchema: any): string | null {
  const names = Object.entries(liveFields(objectSchema))
    .filter(([, item]) => isBinaryItem(item))
    .map(([name]) => name);
  if (names.length > 1) {
    throw new TypeError(
      `the schema has ${names.length} binary live fields (${names.join(", ")}); ` +
        "a schema can have one per direction because a binary frame carries no field name",
    );
  }
  return names[0] ?? null;
}

// --- frames -----------------------------------------------------------------

function isBinaryFrame(frame: unknown): frame is Uint8Array | ArrayBuffer {
  return frame instanceof Uint8Array || frame instanceof ArrayBuffer;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError("a binary field takes a Buffer, Uint8Array or ArrayBuffer");
}

function firstIssue(result: any): string {
  const issue = result?.error?.issues?.[0];
  return (issue && issue.message) || String(result?.error ?? "invalid value");
}

/**
 * A socket read and written through the function's schemas.
 *
 * ```js
 * async talk(inputData, socket) {
 *   const live = new Live(socket, inputData, TalkInput, TalkOutput);
 *   for await (const update of live) {
 *     if (update.field === "audio") {
 *       await live.send({ audio: process(update.value, inputData.voice) });
 *     } else if (update.field === "events") {
 *       ...                      // update.value is an Interrupt or a UserText
 *     }
 *     // an ordinary field (voice) is already set on inputData
 *   }
 *   return { seconds: ... };
 * }
 * ```
 *
 * A frame that does not fit the input schema is answered with
 * `{"error": {"field": ..., "message": ...}}` and skipped; the stream goes on.
 *
 * The function may instead be an async generator (`async *talk(inputData, socket)`):
 * each yield is a cumulative snapshot of the task's output, sent as a task update
 * rather than over the socket, and the last yield (after the loop, once the client
 * closes) is the result.
 */
export class Live {
  readonly socket: Socket;
  readonly input: Record<string, unknown>;

  private readonly inShape: Record<string, any>;
  private readonly inLive: Record<string, any>;
  private readonly inBinary: string | null;
  private readonly outShape: Record<string, any>;
  private readonly outBinary: string | null;
  private readonly outLive: Record<string, any>;
  private refusedBinary = false;

  constructor(socket: Socket, inputData: Record<string, unknown>, inputSchema: any, outputSchema: any) {
    this.socket = socket;
    this.input = inputData;
    this.inShape = shapeOf(inputSchema);
    this.inLive = liveFields(inputSchema);
    this.inBinary = binaryField(inputSchema);
    this.outShape = shapeOf(outputSchema);
    this.outBinary = binaryField(outputSchema);
    this.outLive = liveFields(outputSchema);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Update, void, undefined> {
    for await (const frame of this.frames()) {
      for (const update of await this.read(frame)) yield update;
    }
  }

  private async *frames(): AsyncGenerator<unknown, void, undefined> {
    const socket: any = this.socket;
    if (typeof socket[Symbol.asyncIterator] === "function") {
      for await (const frame of socket) yield frame;
      return;
    }
    for (;;) {
      const frame = await socket.recv();
      if (frame == null) return;
      yield frame;
    }
  }

  private async read(frame: unknown): Promise<Update[]> {
    if (isBinaryFrame(frame)) {
      if (this.inBinary === null) {
        // Once: a caller streaming audio to the wrong function would
        // otherwise get an error frame for every frame it sends.
        if (!this.refusedBinary) {
          this.refusedBinary = true;
          await this.refuse(null, "this function takes no binary frames");
        }
        return [];
      }
      return [{ field: this.inBinary, value: toBuffer(frame) }];
    }

    let patch: unknown;
    try {
      patch = typeof frame === "string" ? JSON.parse(frame) : frame;
    } catch {
      patch = undefined;
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      await this.refuse(null, "a text frame is a JSON object keyed by field name");
      return [];
    }

    const updates: Update[] = [];
    for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
      const live = Object.prototype.hasOwnProperty.call(this.inLive, key);
      if (!live && !Object.prototype.hasOwnProperty.call(this.inShape, key)) {
        await this.refuse(key, "no such field");
        continue;
      }
      if (key === this.inBinary) {
        await this.refuse(key, "send this field's items as binary frames");
        continue;
      }
      // A live field's items are validated against the item schema, an
      // ordinary field against its own and then applied to the input.
      const result = (live ? this.inLive[key] : this.inShape[key]).safeParse(raw);
      if (!result.success) {
        await this.refuse(key, firstIssue(result));
        continue;
      }
      if (!live) this.input[key] = result.data;
      updates.push({ field: key, value: result.data });
    }
    return updates;
  }

  private async refuse(field: string | null, message: string): Promise<void> {
    await this.error(message, field);
  }

  /**
   * Tell the caller something went wrong without ending the stream: a
   * provider error, or why the session is about to end.
   */
  async error(message: string, field: string | null = null): Promise<void> {
    await this.socket.send({ [ERROR_KEY]: { field, message } });
  }

  /**
   * Send items of live output fields, or new values of ordinary ones.
   *
   * `await live.send({ audio: pcm })` is a binary frame;
   * `await live.send({ transcript: word })` and
   * `await live.send({ effect: "echo" })` are JSON frames. Keys in one call
   * other than the binary field go out together as one JSON frame.
   */
  /**
   * Tell the caller to drop what it has buffered of a live output field:
   * the queued audio of an answer the user just talked over.
   */
  async clear(field: string): Promise<void> {
    if (!Object.prototype.hasOwnProperty.call(this.outLive, field)) {
      throw new Error(`the output schema has no live field "${field}"`);
    }
    await this.socket.send({ [CLEAR_KEY]: field });
  }

  async send(fields: Record<string, unknown>): Promise<void> {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!Object.prototype.hasOwnProperty.call(this.outShape, key)) {
        throw new Error(`the output schema has no field "${key}"`);
      }
      if (key === this.outBinary) {
        await this.socket.send(toBuffer(value));
        continue;
      }
      patch[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await this.socket.send(patch);
    }
  }
}
