import { describe, it } from "node:test";
import assert from "node:assert";
import { meta, normalizeCredentials } from "../index.js";
import type { CredentialRequirement, ToolAnnotations } from "../index.js";

describe("meta", () => {
  it("returns a declaration without credentials unchanged", () => {
    const m = { annotations: { readOnlyHint: false, destructiveHint: false } };
    assert.strictEqual(meta(m), m);
    assert.deepStrictEqual(Object.keys(meta({})), []);
  });

  it("normalises a legacy capability entry to slug + capabilities", () => {
    const m = meta({
      credentials: [{ key: "google.calendar.events" }],
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
    assert.deepStrictEqual(m, {
      credentials: [{ slug: "google", capabilities: ["google.calendar.events"] }],
      annotations: { readOnlyHint: false, destructiveHint: false },
    });
  });

  it("folds the legacy provider/name/website form into slug + provider seed", () => {
    const m = meta({
      credentials: [{
        provider: "acme",
        name: "Acme CRM",
        website: "acme.com",
        description: "CRM access",
        optional: true,
        secrets: ["ACME_API_KEY"],
        scopes: ["crm.read"],
      }],
    });
    assert.deepStrictEqual(m.credentials, [{
      slug: "acme",
      description: "CRM access",
      optional: true,
      secrets: ["ACME_API_KEY"],
      scopes: ["crm.read"],
      provider: { name: "Acme CRM", website: "acme.com" },
    }]);
  });

  it("accepts every generated CredentialRequirement and ToolAnnotations field", () => {
    const credential: CredentialRequirement = {
      slug: "aikido-mcp",
      capabilities: ["aikido-mcp.issues"],
      description: "issues",
      optional: false,
      secrets: ["AIKIDO_CLIENT_ID"],
      scopes: ["issues:read"],
      provider: { slug: "aikido", name: "Aikido", website: "aikido.dev", logo_uri: "https://aikido.dev/logo.png" },
      auth: { kind: "oauth2", flow: "authorization_code", authorization_endpoint: "https://app.aikido.dev/oauth/authorize", token_endpoint: "https://app.aikido.dev/api/oauth/token" },
    };
    const annotations: ToolAnnotations = {
      title: "Create event",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };
    const m = meta({ credentials: [credential], annotations });
    assert.deepStrictEqual(m.credentials?.[0], credential);
    assert.strictEqual(m.annotations, annotations);
  });

  it("accepts a map keyed by slug and bare slugs", () => {
    assert.deepStrictEqual(normalizeCredentials({ slack: { capabilities: ["slack.channels.write"] }, huggingface: null }), [
      { slug: "slack", capabilities: ["slack.channels.write"] },
      { slug: "huggingface" },
    ]);
    assert.deepStrictEqual(normalizeCredentials(["aikido-mcp", "slack.channels.read"]), [
      { slug: "aikido-mcp" },
      { slug: "slack", capabilities: ["slack.channels.read"] },
    ]);
  });

  it("rejects unknown keys and wrong types at compile time and at run time", () => {
    // @ts-expect-error: misspelled key
    assert.throws(() => meta({ annotation: { readOnlyHint: true } }), /unknown keys \["annotation"\]/);
    // @ts-expect-error: hints are booleans
    assert.throws(() => meta({ annotations: { readOnlyHint: "yes" } }), TypeError);
    // @ts-expect-error: a credentials declaration is a map or a list
    assert.throws(() => meta({ credentials: "google.calendar" }), TypeError);
    // @ts-expect-error: misspelled credential key
    assert.throws(() => meta({ credentials: [{ kye: "x" }] }), /unknown keys \["kye"\]/);
    // @ts-expect-error: secrets is a list of strings
    assert.throws(() => meta({ credentials: [{ slug: "acme", secrets: "ACME_API_KEY" }] }), TypeError);
    assert.throws(() => meta({ credentials: [{ slug: "acme", provider: "other" }] }), /disagree/);
    assert.throws(() => meta({ credentials: { slack: { slug: "github" } } }), /keyed as 'slack'/);
    assert.throws(() => meta({ credentials: [{ slug: "acme", capabilities: ["nodot"] }] }), /not <slug>.<name>/);
  });

  it("rejects an empty credentials declaration, as sdk-py does", () => {
    assert.throws(() => meta({ credentials: [] }), /empty list; omit credentials to use the app-wide list/);
    assert.throws(() => meta({ credentials: {} }), /empty; omit credentials to use the app-wide list/);
  });

  it("rejects an entry with neither slug nor capability", () => {
    assert.throws(() => meta({ credentials: [{ name: "Acme" }] }), /set 'slug'.*or a capability/);
  });

  it("accepts a null hint as undeclared", () => {
    const m = { annotations: { readOnlyHint: null as unknown as boolean } };
    assert.strictEqual(meta(m), m);
  });
});
