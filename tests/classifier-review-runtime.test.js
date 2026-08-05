import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewRuntime
} from "../scripts/browser/classifier-review-runtime.js";

const COMMAND = {
  reviewKey: "a".repeat(64),
  expectedStatus: "pending",
  commandId: "123e4567-e89b-42d3-a456-426614174003",
  decision: "accept"
};
const VIEW = {
  summary: { total: 1, pending: 1, abstained: 0, resolved: 0 },
  queues: { pending: [], abstained: [], resolved: [] },
  storage: { status: "ready", code: null }
};

const jsonResponse = (value, {
  ok = true,
  contentType = "application/json; charset=utf-8",
  contentLength
} = {}) => ({
  ok,
  headers: {
    get: (name) => name === "content-type"
      ? contentType
      : name === "content-length"
        ? contentLength
        : null
  },
  text: async () => typeof value === "string" ? value : JSON.stringify(value)
});

const createLifecycle = () => {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (listeners.get(name) === listener) {
        listeners.delete(name);
      }
    },
    dispatch: (name) => listeners.get(name)?.()
  };
};

const createHarness = ({
  initialize = async () => ({ status: "ready", code: null }),
  responses = []
} = {}) => {
  const calls = [];
  const lifecycle = createLifecycle();
  const client = {
    initialize,
    reviewRequest: async (path, options) => {
      calls.push({ path, options });
      return responses.shift();
    },
    clear: () => {
      calls.push({ clear: true });
    }
  };
  return {
    runtime: createClassifierReviewRuntime({
      client,
      lifecycleTarget: lifecycle
    }),
    lifecycle,
    calls
  };
};

test("initializes privately and reports only sanitized runtime status", async () => {
  const { runtime, lifecycle, calls } = createHarness();

  assert.deepEqual(runtime.status(), { status: "idle", code: null });
  assert.deepEqual(await runtime.initialize(), { status: "ready", code: null });
  assert.deepEqual(runtime.status(), { status: "ready", code: null });
  assert.equal(lifecycle.listeners.has("pagehide"), true);
  assert.equal(lifecycle.listeners.has("beforeunload"), true);
  assert.deepEqual(Object.keys(runtime).sort(), [
    "clear",
    "initialize",
    "readReviewView",
    "status",
    "submitReview"
  ]);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(JSON.stringify(runtime).includes("token"), false);
  assert.equal(calls.length, 0);
});

test("reads a bounded privacy-safe view and submits one explicit command", async () => {
  const { runtime, calls } = createHarness({
    responses: [
      jsonResponse(VIEW),
      jsonResponse({ status: "accepted", code: null, idempotent: false })
    ]
  });
  await runtime.initialize();

  const view = await runtime.readReviewView();
  const command = await runtime.submitReview(COMMAND);

  assert.deepEqual(view, { status: "ready", code: null, view: VIEW });
  assert.equal(command.status, "ready");
  assert.equal(command.result.status, "accepted");
  assert.equal(calls[0].path, "/api/classifier/reviews");
  assert.equal(calls[1].path, "/api/classifier/reviews/commands");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), COMMAND);
});

test("rejects malformed commands before the private client is called", async () => {
  const { runtime, calls } = createHarness();
  await runtime.initialize();

  for (const command of [
    null,
    {},
    { ...COMMAND, extra: "unexpected" },
    { ...COMMAND, decision: undefined }
  ]) {
    assert.equal(
      (await runtime.submitReview(command)).code,
      "runtime.command.invalid"
    );
  }
  assert.equal(calls.length, 0);
});

test("rejects oversized, mistyped, malformed, and failed responses safely", async () => {
  const oversized = JSON.stringify(VIEW).padEnd(65 * 1024, " ");
  const { runtime } = createHarness({
    responses: [
      jsonResponse(oversized),
      jsonResponse(VIEW, { contentType: "text/html" }),
      jsonResponse("{not-json"),
      jsonResponse({ status: "rejected", code: "review.stale" }, { ok: false })
    ]
  });
  await runtime.initialize();

  assert.equal((await runtime.readReviewView()).code, "runtime.view.denied");
  assert.equal((await runtime.readReviewView()).code, "runtime.view.denied");
  assert.equal((await runtime.readReviewView()).code, "runtime.view.denied");
  const rejected = await runtime.submitReview(COMMAND);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.code, "review.stale");
});

test("failed initialization is sanitized and consumes runtime capability", async () => {
  const privateLikeCode = "client.private-provider-detail";
  const { runtime, lifecycle, calls } = createHarness({
    initialize: async () => ({
      status: "rejected",
      code: privateLikeCode
    })
  });

  const failed = await runtime.initialize();

  assert.equal(failed.status, "rejected");
  assert.equal(failed.code, "runtime.bootstrap.denied");
  assert.equal((await runtime.initialize()).code, "runtime.bootstrap.unavailable");
  assert.equal((await runtime.readReviewView()).code, "runtime.session.unavailable");
  assert.deepEqual(runtime.status(), {
    status: "failed",
    code: "runtime.bootstrap.denied"
  });
  assert.equal(calls.filter((call) => call.clear).length, 1);
  assert.equal(lifecycle.listeners.size, 0);
});

test("page lifecycle and explicit clear destroy the session idempotently", async () => {
  for (const event of ["pagehide", "beforeunload"]) {
    const { runtime, lifecycle, calls } = createHarness();
    await runtime.initialize();
    lifecycle.dispatch(event);
    runtime.clear();

    assert.deepEqual(runtime.status(), { status: "cleared", code: null });
    assert.equal((await runtime.readReviewView()).code, "runtime.session.unavailable");
    assert.equal(lifecycle.listeners.size, 0);
    assert.equal(calls.filter((call) => call.clear).length, 1);
  }
});

test("requires explicit private client and lifecycle adapters", () => {
  assert.throws(
    () => createClassifierReviewRuntime(),
    /private bootstrap client/
  );
  assert.throws(
    () => createClassifierReviewRuntime({
      client: {
        initialize: () => {},
        reviewRequest: () => {},
        clear: () => {}
      }
    }),
    /lifecycle target/
  );
});
