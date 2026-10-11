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

const CREDENTIAL_STR_KEYS = ["provider", "name", "website", "key", "description"];
const CREDENTIAL_LIST_KEYS = ["secrets", "scopes"];
const CREDENTIAL_KEYS = [...CREDENTIAL_STR_KEYS, "optional", ...CREDENTIAL_LIST_KEYS];
const ANNOTATION_HINT_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const ANNOTATION_KEYS = ["title", ...ANNOTATION_HINT_KEYS];

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const typeName = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const unknownKeys = (obj: object, allowed: string[]) => Object.keys(obj).filter((k) => !allowed.includes(k)).sort();

function checkCredential(i: number, entry: unknown): void {
  const where = `meta() credentials[${i}]`;
  if (!isObject(entry)) throw new TypeError(`${where}: expected an object, got ${typeName(entry)}`);
  const unknown = unknownKeys(entry, CREDENTIAL_KEYS);
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown keys ${JSON.stringify(unknown)}; allowed: ${JSON.stringify(CREDENTIAL_KEYS)}`);
  }
  for (const k of CREDENTIAL_STR_KEYS) {
    if (entry[k] !== undefined && typeof entry[k] !== "string") {
      throw new TypeError(`${where}.${k}: expected a string, got ${typeName(entry[k])}`);
    }
  }
  if (entry.optional !== undefined && typeof entry.optional !== "boolean") {
    throw new TypeError(`${where}.optional: expected a boolean, got ${typeName(entry.optional)}`);
  }
  for (const k of CREDENTIAL_LIST_KEYS) {
    const v = entry[k];
    if (v !== undefined && !(Array.isArray(v) && v.every((s) => typeof s === "string"))) {
      throw new TypeError(`${where}.${k}: expected a list of strings`);
    }
  }
  if (!entry.key && !entry.provider) {
    throw new Error(`${where}: set 'key' (a capability like 'google.calendar.events') or 'provider'`);
  }
}

function checkAnnotations(annotations: unknown): void {
  if (!isObject(annotations)) {
    throw new TypeError(`meta() annotations: expected an object, got ${typeName(annotations)}`);
  }
  const unknown = unknownKeys(annotations, ANNOTATION_KEYS);
  if (unknown.length > 0) {
    throw new Error(`meta() annotations: unknown keys ${JSON.stringify(unknown)}; allowed: ${JSON.stringify(ANNOTATION_KEYS)}`);
  }
  if (annotations.title !== undefined && typeof annotations.title !== "string") {
    throw new TypeError("meta() annotations.title: expected a string");
  }
  for (const k of ANNOTATION_HINT_KEYS) {
    const v = annotations[k];
    if (v !== undefined && v !== null && typeof v !== "boolean") {
      throw new TypeError(`meta() annotations.${k}: expected a boolean, got ${typeName(v)}`);
    }
  }
}

/**
 * Declares a function's metadata and returns `m` unchanged. Editors
 * type-check the declaration, plain `.js` apps included (with `// @ts-check`).
 *
 * Throws on a malformed declaration, at import time, with the same checks as
 * sdk-py's `@function`: an empty `credentials` list (omit it to use the
 * app-wide list from inf.yml), unknown keys, wrong value types, or a
 * credential with neither `key` nor `provider`. A null hint means
 * "not declared"; the schema omits it.
 */
export function meta(m: FunctionMeta): FunctionMeta {
  if (!isObject(m)) throw new TypeError(`meta(): expected an object, got ${typeName(m)}`);
  const unknown = unknownKeys(m, ["credentials", "annotations"]);
  if (unknown.length > 0) {
    throw new Error(`meta(): unknown keys ${JSON.stringify(unknown)}; allowed: ["credentials","annotations"]`);
  }
  if (m.credentials !== undefined) {
    if (!Array.isArray(m.credentials)) {
      throw new TypeError(`meta() credentials: expected a list of objects, got ${typeName(m.credentials)}`);
    }
    if (m.credentials.length === 0) {
      throw new Error("meta() credentials: empty list; omit credentials to use the app-wide list from inf.yml");
    }
    m.credentials.forEach((c, i) => checkCredential(i, c));
  }
  if (m.annotations !== undefined) checkAnnotations(m.annotations);
  return m;
}
