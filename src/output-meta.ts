/**
 * Output metadata types for usage-based pricing.
 *
 * Types are generated from Go source of truth (common-go/pkg/models/usage.go)
 * via `make types`. Factory functions provide type-safe constructors.
 *
 * @example
 * ```js
 * import { textMeta, imageMeta } from "@inferencesh/app";
 *
 * return {
 *   result: generatedText,
 *   output_meta: {
 *     inputs: [textMeta({ tokens: promptTokens })],
 *     outputs: [textMeta({ tokens: completionTokens })],
 *   },
 * };
 * ```
 */

// Re-export all generated types (MetaItem, MetaItemType, OutputMeta, VideoResolution, constants)
export * from "./types.js";

// Import for use in factories
import type { MetaItem } from "./types.js";

// --- Narrowed types for factory inputs ---

export type TextMeta = MetaItem & { type: "text"; tokens: number };
export type ImageMeta = MetaItem & { type: "image" };
export type VideoMeta = MetaItem & { type: "video" };
export type AudioMeta = MetaItem & { type: "audio" };
export type RawMeta = MetaItem & { type: "raw" };

// --- Factories ---

/** Create a text metadata item. */
export function textMeta(opts: Omit<TextMeta, "type">): TextMeta {
  return { type: "text", ...opts };
}

/** Create an image metadata item. */
export function imageMeta(opts: Omit<ImageMeta, "type"> = {} as any): ImageMeta {
  return { type: "image", ...opts };
}

/** Create a video metadata item. */
export function videoMeta(opts: Omit<VideoMeta, "type"> = {} as any): VideoMeta {
  return { type: "video", ...opts };
}

/** Create an audio metadata item. */
export function audioMeta(opts: Omit<AudioMeta, "type"> = {} as any): AudioMeta {
  return { type: "audio", ...opts };
}

/** Create a raw metadata item (custom pricing). */
export function rawMeta(opts: Omit<RawMeta, "type"> = {} as any): RawMeta {
  return { type: "raw", ...opts };
}
