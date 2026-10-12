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

import type { CredentialRequirement, ProviderSeed, ToolAnnotations } from "./types.js";

/**
 * One credential entry as an app may write it: the current keys, plus the
 * older spellings (`provider` as a string, `key` as a capability, `name`
 * and `website`) which are folded into the current ones.
 */
export interface CredentialEntry extends Omit<CredentialRequirement, "provider"> {
  provider?: string | ProviderSeed;
  /** Older: a capability such as `google.calendar.events`. */
  key?: string;
  /** Older: the provider's display name (now `provider.name`). */
  name?: string;
  /** Older: the provider's site (now `provider.website`). */
  website?: string;
}

/**
 * The credentials a function needs, in any accepted form: a map keyed by
 * credential slug, or a list of entries or bare slugs (a dotted string is a
 * capability).
 */
export type CredentialsDeclaration =
  | Record<string, CredentialEntry | null | undefined>
  | Array<string | CredentialEntry>;

export interface FunctionMeta {
  /**
   * The credentials this function needs at run time. Each entry must be
   * covered by the app-wide `credentials:` in inf.yml. A function without
   * this gets the app-wide list.
   */
  credentials?: CredentialsDeclaration;
  /** Hints about the function's behavior (read-only, destructive, ...). */
  annotations?: ToolAnnotations;
}

/** What `meta()` returns: credentials normalised to the shape the engine writes. */
export interface NormalizedFunctionMeta {
  credentials?: CredentialRequirement[];
  annotations?: ToolAnnotations;
}

// The entry as written to functions_schema.json, in this key order.
export const CREDENTIAL_KEYS = ["slug", "capabilities", "description", "optional", "secrets", "scopes", "provider", "auth"] as const;
export const PROVIDER_SEED_KEYS = ["slug", "name", "description", "website", "logo_uri", "docs_uri", "tos_uri", "policy_uri"] as const;
// Older spellings, read and folded into the keys above.
const LEGACY_CREDENTIAL_KEYS = ["key", "name", "website"];
const CREDENTIAL_STR_KEYS = ["slug", "description"];
const CREDENTIAL_LIST_KEYS = ["capabilities", "secrets", "scopes"];
const ANNOTATION_HINT_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const ANNOTATION_KEYS = ["title", ...ANNOTATION_HINT_KEYS];

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const typeName = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const unknownKeys = (obj: object, allowed: readonly string[]) =>
  Object.keys(obj).filter((k) => !allowed.includes(k)).sort();

function strList(where: string, k: string, v: unknown): string[] {
  if (!(Array.isArray(v) && v.every((s) => typeof s === "string"))) {
    throw new TypeError(`${where}.${k}: expected a list of strings`);
  }
  return [...v];
}

/** A bare string: a credential slug, or a capability when dotted. */
function entryFromRef(ref: string): CredentialEntry {
  return ref.includes(".") ? { key: ref } : { slug: ref };
}

function checkProviderSeed(where: string, seed: unknown): ProviderSeed {
  if (!isObject(seed)) throw new TypeError(`${where}: expected an object, got ${typeName(seed)}`);
  const unknown = unknownKeys(seed, PROVIDER_SEED_KEYS);
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown keys ${JSON.stringify(unknown)}; allowed: ${JSON.stringify(PROVIDER_SEED_KEYS)}`);
  }
  const out: Record<string, string> = {};
  for (const k of PROVIDER_SEED_KEYS) {
    const v = seed[k];
    if (v === undefined) continue;
    if (typeof v !== "string") throw new TypeError(`${where}.${k}: expected a string, got ${typeName(v)}`);
    if (v) out[k] = v;
  }
  return out as ProviderSeed;
}

/** One entry, in any accepted spelling, as the normalised requirement. */
function checkCredential(where: string, raw: unknown, slugFromKey = ""): CredentialRequirement {
  const entry: unknown = typeof raw === "string" ? entryFromRef(raw) : raw;
  if (!isObject(entry)) throw new TypeError(`${where}: expected an object or a slug, got ${typeName(entry)}`);
  const unknown = unknownKeys(entry, [...CREDENTIAL_KEYS, ...LEGACY_CREDENTIAL_KEYS]);
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown keys ${JSON.stringify(unknown)}; allowed: ${JSON.stringify(CREDENTIAL_KEYS)}`);
  }
  for (const k of [...CREDENTIAL_STR_KEYS, ...LEGACY_CREDENTIAL_KEYS]) {
    if (entry[k] !== undefined && typeof entry[k] !== "string") {
      throw new TypeError(`${where}.${k}: expected a string, got ${typeName(entry[k])}`);
    }
  }
  if (entry.optional !== undefined && typeof entry.optional !== "boolean") {
    throw new TypeError(`${where}.optional: expected a boolean, got ${typeName(entry.optional)}`);
  }

  let slug = typeof entry.slug === "string" ? entry.slug : "";
  let seed: Record<string, string> = {};
  const provider = entry.provider;
  if (typeof provider === "string") {
    // The older form: provider was the credential slug.
    if (slug && provider !== slug) throw new Error(`${where}: slug '${slug}' and provider '${provider}' disagree`);
    slug = provider;
  } else if (provider !== undefined && provider !== null) {
    seed = { ...(checkProviderSeed(`${where}.provider`, provider) as Record<string, string>) };
  }
  for (const k of ["name", "website"]) {
    const v = entry[k];
    if (typeof v === "string" && v && !seed[k]) seed[k] = v;
  }

  const capabilities = entry.capabilities !== undefined ? strList(where, "capabilities", entry.capabilities) : [];
  const key = typeof entry.key === "string" ? entry.key : "";
  if (key) {
    if (key.includes(".") && !capabilities.includes(key)) capabilities.push(key);
    if (!slug) slug = key.split(".", 1)[0];
  }
  if (slugFromKey) {
    if (slug && slug !== slugFromKey) throw new Error(`${where}: entry says slug '${slug}' but is keyed as '${slugFromKey}'`);
    slug = slugFromKey;
  }
  if (!slug) {
    throw new Error(`${where}: set 'slug' (the credential slug, like 'slack') or a capability under 'capabilities'`);
  }
  for (const capability of capabilities) {
    if (!capability.includes(".")) throw new Error(`${where}: capability '${capability}' is not <slug>.<name>`);
  }
  const auth = entry.auth;
  if (auth !== undefined && auth !== null && !isObject(auth)) {
    throw new TypeError(`${where}.auth: expected an object, got ${typeName(auth)}`);
  }

  const out: CredentialRequirement = { slug };
  if (capabilities.length > 0) out.capabilities = capabilities;
  if (typeof entry.description === "string" && entry.description) out.description = entry.description;
  if (entry.optional !== undefined) out.optional = entry.optional as boolean;
  for (const k of ["secrets", "scopes"] as const) {
    if (entry[k] !== undefined) {
      const v = strList(where, k, entry[k]);
      if (v.length > 0) out[k] = v;
    }
  }
  if (Object.keys(seed).length > 0) out.provider = seed as ProviderSeed;
  if (auth) out.auth = { ...(auth as object) } as CredentialRequirement["auth"];
  return out;
}

/**
 * Every accepted form of a credentials declaration as the list the engine
 * writes: entries in canonical key order, legacy keys folded in.
 */
export function normalizeCredentials(credentials: unknown, where = "meta() credentials"): CredentialRequirement[] {
  if (isObject(credentials)) {
    const slugs = Object.keys(credentials);
    if (slugs.length === 0) throw new Error(`${where}: empty; omit credentials to use the app-wide list from inf.yml`);
    return slugs.map((slug) => {
      const entry = credentials[slug];
      if (entry !== undefined && entry !== null && !isObject(entry)) {
        throw new TypeError(`${where}['${slug}']: expected an object, got ${typeName(entry)}`);
      }
      return checkCredential(`${where}['${slug}']`, entry ?? {}, slug);
    });
  }
  if (!Array.isArray(credentials)) {
    throw new TypeError(`${where}: expected an object keyed by slug or a list of entries, got ${typeName(credentials)}`);
  }
  if (credentials.length === 0) throw new Error(`${where}: empty list; omit credentials to use the app-wide list from inf.yml`);
  return credentials.map((c, i) => checkCredential(`${where}[${i}]`, c));
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
 * Declares a function's metadata. Credentials come back normalised to the
 * shape the engine writes (keyed by slug, legacy keys folded in), the same
 * as sdk-py's `@function`; annotations are returned as given. Editors
 * type-check the declaration, plain `.js` apps included (with `// @ts-check`).
 *
 * Throws on a malformed declaration, at import time: an empty `credentials`
 * declaration (omit it to use the app-wide list from inf.yml), unknown keys,
 * wrong value types, or an entry with neither a slug nor a capability. A
 * null hint means "not declared"; the schema omits it.
 */
export function meta(m: FunctionMeta): NormalizedFunctionMeta {
  if (!isObject(m)) throw new TypeError(`meta(): expected an object, got ${typeName(m)}`);
  const unknown = unknownKeys(m, ["credentials", "annotations"]);
  if (unknown.length > 0) {
    throw new Error(`meta(): unknown keys ${JSON.stringify(unknown)}; allowed: ["credentials","annotations"]`);
  }
  if (m.annotations !== undefined) checkAnnotations(m.annotations);
  if (m.credentials === undefined) return m as NormalizedFunctionMeta;
  const out: NormalizedFunctionMeta = { credentials: normalizeCredentials(m.credentials) };
  if (m.annotations !== undefined) out.annotations = m.annotations as ToolAnnotations;
  return out;
}
