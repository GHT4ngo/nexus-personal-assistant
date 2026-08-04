import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIFIER_REVIEW_COMMAND_MAX_BYTES,
  createClassifierReviewRouteHandler
} from "../scripts/routes/classifier-reviews.js";

const validCommand = {
  reviewKey: "a".repeat(64),
  expectedStatus: "pending",
  commandId: "123e4567-e89b-42d3-a456-426614174000",
  decision: "accept"
};

const createHarness = ({
  viewResult = {
    summary: { total: 0, pending: 0, abstained: 0, resolved: 0 },
    queues: { pending: [], abstained: [], resolved: [] },
    storage: { status: "ready", code: null }
  },
  commandResult = { status: "accepted", code: null, idempotent: false },
  readError = null
} = {}) => {
  const calls = { view: 0, command: 0, bodyLimits: [] };
  const replies = [];
  const handler = createClassifierReviewRouteHandler({
    viewService: {
      readReviewView: async () => {
        calls.view += 1;
        return structuredClone(viewResult);
      }
    },
    commandService: {
      submitReview: async (command) => {
        calls.command += 1;
        calls.submitted = structuredClone(command);
        return structuredClone(commandResult);
      }
    },
    readRequestBody: async (request, maxBytes) => {
      calls.bodyLimits.push(maxBytes);
      if (readError) {
        throw readError;
      }
      return request.body ?? "";
    },
    sendJson: (_response, status, data) => replies.push({ status, data })
  });
  const invoke = async ({
    method = "GET",
    path = "/api/classifier/reviews",
    body = "",
    contentType
  } = {}) => {
    replies.length = 0;
    const headers = contentType ? { "content-type": contentType } : {};
    const handled = await handler(
      { method, body, headers },
      new URL(path, "http://localhost:8050"),
      {}
    );
    return { handled, reply: replies[0], calls };
  };
  return { invoke, calls };
};

test("requires injected view, command, and HTTP adapters", () => {
  assert.throws(() => createClassifierReviewRouteHandler(), /view service/);
  assert.throws(
    () => createClassifierReviewRouteHandler({
      viewService: { readReviewView: async () => ({}) }
    }),
    /command service/
  );
});

test("returns the sanitized read view through GET only", async () => {
  const viewResult = {
    summary: { total: 1, pending: 1, abstained: 0, resolved: 0 },
    queues: {
      pending: [{
        reviewKey: "a".repeat(64),
        subjectKey: "b".repeat(64),
        suggestionType: "topic",
        suggestedValue: "work",
        extractedValue: null,
        confidence: 0.9,
        abstained: false,
        evidenceAvailable: true,
        status: "pending",
        effectiveValue: null
      }],
      abstained: [],
      resolved: []
    },
    storage: { status: "ready", code: null }
  };
  const harness = createHarness({ viewResult });

  const result = await harness.invoke();
  const wrongMethod = await harness.invoke({ method: "POST" });

  assert.equal(result.reply.status, 200);
  assert.deepEqual(result.reply.data, viewResult);
  assert.equal(wrongMethod.reply.status, 405);
  assert.equal(harness.calls.view, 1);
});

test("maps failed view storage to service unavailable", async () => {
  const harness = createHarness({
    viewResult: {
      summary: { total: 0, pending: 0, abstained: 0, resolved: 0 },
      queues: { pending: [], abstained: [], resolved: [] },
      storage: { status: "failed", code: "store.invalid" }
    }
  });

  const result = await harness.invoke();

  assert.equal(result.reply.status, 503);
  assert.equal(result.reply.data.storage.code, "store.invalid");
});

test("submits an exact JSON command with an explicit 4 KiB reader limit", async () => {
  const harness = createHarness();

  const result = await harness.invoke({
    method: "POST",
    path: "/api/classifier/reviews/commands",
    body: JSON.stringify(validCommand),
    contentType: "application/json; charset=utf-8"
  });

  assert.equal(result.reply.status, 201);
  assert.deepEqual(harness.calls.submitted, validCommand);
  assert.deepEqual(harness.calls.bodyLimits, [
    CLASSIFIER_REVIEW_COMMAND_MAX_BYTES
  ]);
});

test("rejects unsupported methods, content types, and query parameters", async () => {
  const harness = createHarness();
  const cases = [
    { method: "GET", path: "/api/classifier/reviews/commands" },
    {
      method: "POST",
      path: "/api/classifier/reviews/commands",
      body: "{}",
      contentType: "text/plain"
    },
    { method: "GET", path: "/api/classifier/reviews?private=value" }
  ];
  const responses = [];
  for (const request of cases) {
    responses.push((await harness.invoke(request)).reply);
  }

  assert.deepEqual(responses.map((response) => response.status), [405, 415, 400]);
  assert.equal(harness.calls.command, 0);
  assert.equal(JSON.stringify(responses).includes("private=value"), false);
});

test("rejects malformed, non-object, unknown-field, oversized, and unreadable bodies", async () => {
  const privateLikeText = "synthetic private submitted value";
  const harness = createHarness();
  const bodies = [
    "{malformed",
    "[]",
    JSON.stringify({ ...validCommand, unexpected: privateLikeText }),
    JSON.stringify({ padding: "x".repeat(CLASSIFIER_REVIEW_COMMAND_MAX_BYTES) })
  ];
  const responses = [];
  for (const body of bodies) {
    responses.push((await harness.invoke({
      method: "POST",
      path: "/api/classifier/reviews/commands",
      body,
      contentType: "application/json"
    })).reply);
  }
  const unreadable = await createHarness({
    readError: new Error(privateLikeText)
  }).invoke({
    method: "POST",
    path: "/api/classifier/reviews/commands",
    body: "{}",
    contentType: "application/json"
  });
  responses.push(unreadable.reply);

  assert.deepEqual(responses.map((response) => response.status), [
    400, 400, 400, 413, 400
  ]);
  assert.equal(harness.calls.command, 0);
  assert.equal(JSON.stringify(responses).includes(privateLikeText), false);
});

test("maps command results to stable HTTP statuses without altering responses", async () => {
  const cases = [
    [{ status: "accepted", code: null, idempotent: true }, 200],
    [{ status: "rejected", code: "review.key.unknown", idempotent: false }, 404],
    [{ status: "rejected", code: "review.stale", idempotent: false }, 409],
    [{ status: "rejected", code: "review.value.invalid", idempotent: false }, 400],
    [{ status: "failed", code: "store.failed", idempotent: false }, 503]
  ];

  for (const [commandResult, expectedStatus] of cases) {
    const harness = createHarness({ commandResult });
    const response = await harness.invoke({
      method: "POST",
      path: "/api/classifier/reviews/commands",
      body: JSON.stringify(validCommand),
      contentType: "application/json"
    });

    assert.equal(response.reply.status, expectedStatus);
    assert.deepEqual(response.reply.data, commandResult);
  }
});

test("keeps unrelated paths outside the classifier review boundary", async () => {
  const harness = createHarness();

  const result = await harness.invoke({
    method: "GET",
    path: "/api/google/status"
  });

  assert.equal(result.handled, false);
  assert.equal(result.reply, undefined);
  assert.equal(harness.calls.view, 0);
  assert.equal(harness.calls.command, 0);
});
