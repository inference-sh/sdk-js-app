import { describe, it } from "node:test";
import assert from "node:assert";
import { meta } from "../index.js";
import type { FunctionMeta, CredentialRequirement, ToolAnnotations } from "../index.js";

describe("meta", () => {
  it("returns its argument unchanged", () => {
    const m = {
      credentials: [{ key: "google.calendar.events" }],
      annotations: { readOnlyHint: false, destructiveHint: false },
    };
    assert.strictEqual(meta(m), m);
    assert.deepStrictEqual(meta(m), {
      credentials: [{ key: "google.calendar.events" }],
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
  });

  it("adds no keys to an empty declaration", () => {
    assert.deepStrictEqual(Object.keys(meta({})), []);
  });

  it("accepts every generated CredentialRequirement and ToolAnnotations field", () => {
    const credential: CredentialRequirement = {
      provider: "acme",
      name: "Acme CRM",
      website: "acme.com",
      key: "acme.crm",
      description: "CRM access",
      optional: true,
      secrets: ["ACME_API_KEY"],
      scopes: ["crm.read"],
    };
    const annotations: ToolAnnotations = {
      title: "Create event",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };
    const m: FunctionMeta = meta({ credentials: [credential], annotations });
    assert.strictEqual(m.credentials?.[0], credential);
    assert.strictEqual(m.annotations, annotations);
  });

  it("rejects unknown keys and wrong types at compile time", () => {
    // @ts-expect-error: misspelled key
    meta({ annotation: { readOnlyHint: true } });
    // @ts-expect-error: hints are booleans
    meta({ annotations: { readOnlyHint: "yes" } });
    // @ts-expect-error: credentials is a list
    meta({ credentials: { key: "google.calendar" } });
  });
});
