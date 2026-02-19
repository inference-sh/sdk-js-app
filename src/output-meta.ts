/**
 * Output metadata types for usage-based pricing.
 *
 * Apps include OutputMeta in their run output to report what was consumed
 * (inputs) and what was produced (outputs). The backend uses this for
 * pricing calculation.
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

// --- Types ---

export interface MetaItemBase {
  type: string;
  extra?: Record<string, unknown>;
}

export interface TextMeta extends MetaItemBase {
  type: "text";
  tokens: number;
}

export interface ImageMeta extends MetaItemBase {
  type: "image";
  width?: number;
  height?: number;
  resolution_mp?: number;
  steps?: number;
  count?: number;
}

export interface VideoMeta extends MetaItemBase {
  type: "video";
  width?: number;
  height?: number;
  resolution_mp?: number;
  resolution?: "480p" | "720p" | "1080p" | "1440p" | "4k";
  seconds?: number;
  fps?: number;
}

export interface AudioMeta extends MetaItemBase {
  type: "audio";
  seconds?: number;
  sample_rate?: number;
}

export interface RawMeta extends MetaItemBase {
  type: "raw";
  cost?: number;
}

export type MetaItem = TextMeta | ImageMeta | VideoMeta | AudioMeta | RawMeta;

export interface OutputMeta {
  inputs?: MetaItem[];
  outputs?: MetaItem[];
}

// --- Factories ---

/** Create a text metadata item. */
export function textMeta(opts: Omit<TextMeta, "type">): TextMeta {
  return { type: "text", ...opts };
}

/** Create an image metadata item. */
export function imageMeta(opts: Omit<ImageMeta, "type"> = {}): ImageMeta {
  return { type: "image", ...opts };
}

/** Create a video metadata item. */
export function videoMeta(opts: Omit<VideoMeta, "type"> = {}): VideoMeta {
  return { type: "video", ...opts };
}

/** Create an audio metadata item. */
export function audioMeta(opts: Omit<AudioMeta, "type"> = {}): AudioMeta {
  return { type: "audio", ...opts };
}

/** Create a raw metadata item (custom pricing). */
export function rawMeta(opts: Omit<RawMeta, "type"> = {}): RawMeta {
  return { type: "raw", ...opts };
}
