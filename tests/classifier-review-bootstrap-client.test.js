import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewBootstrapClient
} from "../scripts/browser/classifier-review-bootstrap-client.js";

const CODE = "synthetic-browser-bootstrap-code-over-32-bytes";
const TOKEN = "synthetic-browser-review-token-over-32-bytes";
const EXPIRY = 1_786_000_060_000;

const handoffPayload = (overrides = {}) => JSON.stringify({
  bootstrapCode: CODE,
  bootstrapPath: "/api/classifier/reviews/bootstrap",
  expiresAt: EXPIRY,
  ...overrides
});

const createElement = (textContent = handoffPayload()) => ({
  textContent,
  removed: false,
  remove() {
    this.removed = true;
  }
});

const readyResponse = (overrides = {}) => ({
  ok: true,
  text: async () => JSON.stringify({
    status: "ready",
    code: null,
    token: TOKEN,
    ...overrides
  })
});

test("removes the handoff before redeeming and retains no public token", async () => {
  const element = createElement();
  const calls = [];
  const client = createClassifierReviewBootstrapClient({
    document: { getElementById: () => element },
    now: () => EXPIRY - 1_000,
    fetch: async (path, options) => {
      calls.push({ path, options, removed: element.removed });
      return readyResponse();
    }
  });

  const initialized = await client.initialize();

  assert.deepEqual(initialized, { status: "ready", code: null });
  assert.equal(element.removed, true);
  assert.equal(element.textContent, "");
  assert.equal(calls[0].removed, true);
  assert.equal(calls[0].path, "/api/classifier/reviews/bootstrap");
  assert.deepEqual(JSON.parse(calls[0].options.body), { bootstrapCode: CODE });
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.referrerPolicy, "no-referrer");
  assert.equal(JSON.stringify(client).includes(TOKEN), false);
  assert.equal(Object.hasOwn(client, "token"), false);
});

test("authorizes only bounded review endpoints from the private session", async () => {
  const calls = [];
  const client = createClassifierReviewBootstrapClient({
    document: { getElementById: () => createElement() },
    now: () => EXPIRY - 1_000,
    fetch: async (path, options) => {
      calls.push({ path, options });
      return calls.length === 1 ? readyResponse() : { ok: true };
    }
  });
  await client.initialize();
  await client.reviewRequest("/api/classifier/reviews");
  await client.reviewRequest("/api/classifier/reviews/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });

  assert.equal(calls[1].options.method, "GET");
  assert.equal(calls[1].options.headers.get("X-Nexus-Review-Token"), TOKEN);
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].options.headers.get("X-Nexus-Review-Token"), TOKEN);
  assert.equal(calls[2].options.cache, "no-store");
  await assert.rejects(
    client.reviewRequest("https://example.test/collect"),
    /outside the allowed boundary/
  );
  await assert.rejects(
    client.reviewRequest("/api/classifier/reviews", { method: "POST" }),
    /outside the allowed boundary/
  );
});

test("expired or malformed handoffs are removed without network access", async () => {
  for (const textContent of [
    handoffPayload({ expiresAt: EXPIRY - 1 }),
    handoffPayload({ bootstrapPath: "https://example.test/collect" }),
    handoffPayload({ extra: "unexpected" }),
    "{not-json"
  ]) {
    const element = createElement(textContent);
    let calls = 0;
    const client = createClassifierReviewBootstrapClient({
      document: { getElementById: () => element },
      now: () => EXPIRY,
      fetch: async () => {
        calls += 1;
      }
    });

    assert.equal((await client.initialize()).code, "client.bootstrap.denied");
    assert.equal(element.removed, true);
    assert.equal(element.textContent, "");
    assert.equal(calls, 0);
  }
});

test("failed, invalid, and replayed redemption cannot create a session", async () => {
  for (const response of [
    { ok: false, text: async () => "" },
    readyResponse({ token: "short" }),
    readyResponse({ extra: "unexpected" }),
    { ok: true, text: async () => "{not-json" }
  ]) {
    const client = createClassifierReviewBootstrapClient({
      document: { getElementById: () => createElement() },
      now: () => EXPIRY - 1_000,
      fetch: async () => response
    });

    assert.equal((await client.initialize()).code, "client.bootstrap.denied");
    assert.equal((await client.initialize()).code, "client.bootstrap.unavailable");
    await assert.rejects(
      client.reviewRequest("/api/classifier/reviews"),
      /session is not ready/
    );
  }
});

test("network failure is sanitized and clear destroys request capability", async () => {
  const failing = createClassifierReviewBootstrapClient({
    document: { getElementById: () => createElement() },
    now: () => EXPIRY - 1_000,
    fetch: async () => {
      throw new Error(`provider exposed ${CODE}`);
    }
  });
  assert.deepEqual(await failing.initialize(), {
    status: "rejected",
    code: "client.bootstrap.failed"
  });

  const ready = createClassifierReviewBootstrapClient({
    document: { getElementById: () => createElement() },
    now: () => EXPIRY - 1_000,
    fetch: async () => readyResponse()
  });
  await ready.initialize();
  ready.clear();

  assert.equal(ready.status(), "cleared");
  await assert.rejects(
    ready.reviewRequest("/api/classifier/reviews"),
    /session is not ready/
  );
});

test("requires explicit browser adapters", () => {
  assert.throws(
    () => createClassifierReviewBootstrapClient(),
    /document adapter/
  );
  assert.throws(
    () => createClassifierReviewBootstrapClient({
      document: { getElementById: () => null }
    }),
    /fetch adapter/
  );
});
