/**
 * Per-function metadata: the credentials a function needs and hints about
 * what it does. Node twin of sdk-py's `@function(credentials=..., annotations=...)`.
 *
 * Export it next to the function's Input and Output schemas, named
 * `<PascalName>Meta`; the kernel's discovery reads it from there:
 *
 * ```js
 * import { meta } from "@inferencesh/app";
 *
 * export const CreateEventInput = z.object({ ... });
 * export const CreateEventOutput = z.object({ ... });
 * export const CreateEventMeta = meta({
 *   credentials: [{ key: "google.calendar.events" }],
 *   annotations: { readOnlyHint: false, destructiveHint: false },
 * });
 *
 * export class App { async createEvent(input) { ... } }
 * ```
 */

import type { CredentialRequirement, ToolAnnotations } from "./types.js";

export interface FunctionMeta {
  /**
   * The credentials this function needs at run time. Each entry must be
   * covered by the app-wide `credentials:` in inf.yml. A function without
   * this gets the app-wide list.
   */
  credentials?: CredentialRequirement[];
  /** Hints about the function's behavior (read-only, destructive, ...). */
  annotations?: ToolAnnotations;
}

/**
 * Declares a function's metadata. Returns `m` unchanged; it exists so editors
 * type-check the declaration, plain `.js` apps included.
 */
export function meta(m: FunctionMeta): FunctionMeta {
  return m;
}
