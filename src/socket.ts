/**
 * The socket a stream function talks to.
 *
 * An app declares a stream function by taking a `socket` parameter after its
 * input:
 *
 * ```js
 * export class App {
 *   async stream(inputData, socket) {
 *     for await (const frame of socket) {   // Buffer or string, in order
 *       await socket.send(frame);           // Buffer -> binary, string -> text,
 *     }                                     // anything else -> JSON text
 *     return { ... };
 *   }
 * }
 * ```
 *
 * The function runs until it returns; its return value is the result the
 * platform records. Frames from the client arrive in order; the iterator ends
 * (and `recv()` resolves to null) when the client closes. Returning ends the
 * stream for the client. This is a different thing from the platform's app
 * session (a worker leased across several calls): a stream function runs as
 * one call, inside an app session or on its own.
 *
 * The object the kernel passes in implements this interface; the interface
 * here is for typing.
 */

/** One frame on the wire: binary (Buffer) or text (string). */
export type Frame = Buffer | string;

/** One live stream between a client and a stream function. */
export interface Socket {
  readonly id: string;
  metadata: Record<string, unknown>;

  /** True once the client is gone or the app closed the socket. */
  readonly closed: boolean;

  /** The next frame from the client, or null once it is gone. */
  recv(): Promise<Frame | null>;

  [Symbol.asyncIterator](): AsyncIterator<Frame>;

  /** Send a frame: Buffer/Uint8Array/ArrayBuffer as binary, string as text, anything else as JSON text. */
  send(data: Buffer | Uint8Array | ArrayBuffer | string | object): Promise<void>;

  /** Stop reading from the client; the stream ends when the function returns. */
  close(): Promise<void>;
}
