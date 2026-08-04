import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIFIER_REVIEW_TOKEN_HEADER,
  createClassifierReviewRequestGuard
} from "../scripts/http/classifier-review-guard.js";

const ORIGIN = "http://localhost:8050";
const TOKEN = "synthetic-review-command-token-32-bytes";

const createHarness = () => {
  const calls = { handler: 0 };
  const replies = [];
  const guard = createClassifierReviewRequestGuard({
    handler: async () => {
      calls.handler += 1;
      return true;
    },
    allowedOrigins: [ORIGIN, "http://localhost"],
    commandToken: TOKEN,
    sendJson: (_response, status, data) => replies.push({ status, data })
  });
  const invoke = async ({
    method = "GET",
    path = "/api/classifier/reviews",
    origin,
    token
  } = {}) => {
    replies.length = 0;
    const headers = {};
    if (origin !== undefined) {
      headers.origin = origin;
    }
    if (token !== undefined) {
      headers[CLASSIFIER_REVIEW_TOKEN_HEADER] = token;
    }
    const handled = await guard(
      { method, headers },
      new URL(path, "http://localhost:8050"),
      {}
    );
    return { handled, reply: replies[0], calls };
  };
  return { invoke, calls };
};

test("requires HTTP adapters, unique valid origins, and a strong token", () => {
  const handler = async () => true;
  const sendJson = () => {};
  assert.throws(() => createClassifierReviewRequestGuard(), /HTTP adapters/);
  assert.throws(
    () => createClassifierReviewRequestGuard({
      handler,
      sendJson,
      commandToken: TOKEN
    }),
    /allowed origins/
  );
  for (const allowedOrigins of [
    ["not-an-origin"],
    ["null"],
    ["http://localhost/path"],
    [ORIGIN, `${ORIGIN}/`]
  ]) {
    assert.throws(
      () => createClassifierReviewRequestGuard({
        handler,
        sendJson,
        allowedOrigins,
        commandToken: TOKEN
      }),
      /unique valid origins/
    );
  }
  assert.throws(
    () => createClassifierReviewRequestGuard({
      handler,
      sendJson,
      allowedOrigins: [ORIGIN],
      commandToken: "too-short"
    }),
    /at least 32 bytes/
  );
});

test("allows exact configured browser and Android WebView origins", async () => {
  const harness = createHarness();

  const browser = await harness.invoke({ origin: ORIGIN, token: TOKEN });
  const webView = await harness.invoke({
    origin: "http://localhost",
    token: TOKEN
  });

  assert.equal(browser.handled, true);
  assert.equal(webView.handled, true);
  assert.equal(harness.calls.handler, 2);
  assert.equal(browser.reply, undefined);
});

test("denies missing, null, malformed, and unlisted origins before handler access", async () => {
  const privateLikeOrigin = "https://private.example.test";
  const harness = createHarness();
  const responses = [];
  for (const origin of [undefined, "null", "not-an-origin", privateLikeOrigin]) {
    responses.push(await harness.invoke({ origin }));
  }

  assert.equal(harness.calls.handler, 0);
  assert.ok(responses.every((entry) => entry.reply.status === 403));
  assert.ok(responses.every((entry) =>
    entry.reply.data.code === "request.origin.denied"));
  assert.equal(JSON.stringify(responses).includes(privateLikeOrigin), false);
});

test("requires a matching command token for POST without exposing it", async () => {
  const harness = createHarness();
  const privateLikeToken = "wrong-private-token-that-is-long-enough";
  const denied = [];
  for (const token of [undefined, "", privateLikeToken]) {
    denied.push(await harness.invoke({
      method: "POST",
      path: "/api/classifier/reviews/commands",
      origin: ORIGIN,
      token
    }));
  }
  const allowed = await harness.invoke({
    method: "POST",
    path: "/api/classifier/reviews/commands",
    origin: ORIGIN,
    token: TOKEN
  });

  assert.ok(denied.every((entry) => entry.reply.status === 403));
  assert.ok(denied.every((entry) =>
    entry.reply.data.code === "request.token.denied"));
  assert.equal(harness.calls.handler, 1);
  assert.equal(allowed.reply, undefined);
  assert.equal(JSON.stringify(denied).includes(privateLikeToken), false);
  assert.equal(JSON.stringify(denied).includes(TOKEN), false);
});

test("requires the token for the private read-only GET view", async () => {
  const harness = createHarness();

  const denied = await harness.invoke({ method: "GET", origin: ORIGIN });
  const allowed = await harness.invoke({
    method: "GET",
    origin: ORIGIN,
    token: TOKEN
  });

  assert.equal(denied.reply.data.code, "request.token.denied");
  assert.equal(allowed.reply, undefined);
  assert.equal(harness.calls.handler, 1);
});

test("passes unrelated paths through without origin or token checks", async () => {
  const harness = createHarness();

  await harness.invoke({ path: "/api/google/status" });

  assert.equal(harness.calls.handler, 1);
});
