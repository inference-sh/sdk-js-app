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

  it("rejects unknown keys and wrong types at compile time and at run time", () => {
    // @ts-expect-error: misspelled key
    assert.throws(() => meta({ annotation: { readOnlyHint: true } }), /unknown keys \["annotation"\]/);
    // @ts-expect-error: hints are booleans
    assert.throws(() => meta({ annotations: { readOnlyHint: "yes" } }), TypeError);
    // @ts-expect-error: credentials is a list
    assert.throws(() => meta({ credentials: { key: "google.calendar" } }), TypeError);
    // @ts-expect-error: misspelled credential key
    assert.throws(() => meta({ credentials: [{ kye: "x" }] }), /unknown keys \["kye"\]/);
    // @ts-expect-error: secrets is a list of strings
    assert.throws(() => meta({ credentials: [{ provider: "acme", secrets: "ACME_API_KEY" }] }), TypeError);
  });

  it("rejects an empty credentials list, as sdk-py does", () => {
    assert.throws(() => meta({ credentials: [] }), /empty list; omit credentials to use the app-wide list/);
  });

  it("rejects a credential with neither key nor provider", () => {
    assert.throws(() => meta({ credentials: [{ name: "Acme" }] }), /set 'key'.*or 'provider'/);
  });

  it("accepts a null hint as undeclared", () => {
    const m = { annotations: { readOnlyHint: null as unknown as boolean } };
    assert.strictEqual(meta(m), m);
  });
});
