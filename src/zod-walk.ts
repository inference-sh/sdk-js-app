/**
 * Walking a zod schema through its wrappers, the same way for zod v3 and v4:
 * the app's own zod is passed in and never imported here, so schemas are read
 * by duck-typing `_def`, as the kernel does.
 */

/** The schemas a wrapper (optional, default, nullable, effects, pipe, ...) wraps. */
export function innerSchemas(def: any): any[] {
  const out: any[] = [];
  // v3 + v4: optional / default / nullable / catch / readonly
  if (def.innerType) out.push(def.innerType);
  // v3: effects (preprocess / transform / refine), v4: some wrappers
  if (def.schema) out.push(def.schema);
  if (def.inner) out.push(def.inner);
  // v4: pipe (preprocess, transform) — in, then out
  if (def.in) out.push(def.in);
  if (def.out) out.push(def.out);
  return out;
}

/** The value of a marker on a schema's `_def`, looking through its wrappers. */
export function findMarker(schema: any, marker: symbol, seen = new Set<any>()): unknown {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return undefined;
  seen.add(schema);
  const def = schema._def;
  if (!def || typeof def !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(def, marker)) return def[marker];
  for (const inner of innerSchemas(def)) {
    const found = findMarker(inner, marker, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}
