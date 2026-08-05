import assert from "node:assert/strict";
import test from "node:test";

import {
  classifierReviewEntryStatus,
  createClassifierReviewEntry
} from "../scripts/browser/classifier-review-entry.js";

const createHarness = ({
  initializeResult = { status: "ready", code: null },
  createClientError = null
} = {}) => {
  const calls = {
    clients: 0,
    runtimes: 0,
    initialize: 0,
    read: 0,
    submit: [],
    clear: 0
  };
  let runtimeState = "idle";
  const client = Object.freeze({ private: "synthetic-client-capability" });
  const entry = createClassifierReviewEntry({
    createClient: (options) => {
      calls.clients += 1;
      calls.clientOptions = options;
      if (createClientError) {
        throw createClientError;
      }
      return client;
    },
    createRuntime: (options) => {
      calls.runtimes += 1;
      calls.runtimeOptions = options;
      return {
        initialize: async () => {
          calls.initialize += 1;
          runtimeState = initializeResult.status === "ready" ? "ready" : "failed";
          return initializeResult;
        },
        readReviewView: async () => {
          calls.read += 1;
          return { status: "ready", code: null, view: { synthetic: true } };
        },
        submitReview: async (command) => {
          calls.submit.push(command);
          return {
            status: "ready",
            code: null,
            result: { status: "accepted", code: null }
          };
        },
        status: () => ({ status: runtimeState, code: null }),
        clear: () => {
          calls.clear += 1;
          runtimeState = "cleared";
        }
      };
    }
  });
  return { entry, client, calls };
};

test("constructs and starts the private runtime exactly once", async () => {
  const { entry, client, calls } = createHarness();
  const adapters = {
    document: { synthetic: "document" },
    fetch: async () => {},
    lifecycleTarget: { synthetic: "lifecycle" },
    now: () => 1
  };

  const [first, concurrent] = await Promise.all([
    entry.start(adapters),
    entry.start(adapters)
  ]);
  const duplicate = await entry.start(adapters);

  assert.deepEqual(first, { status: "ready", code: null });
  assert.deepEqual(concurrent, first);
  assert.deepEqual(duplicate, first);
  assert.equal(calls.clients, 1);
  assert.equal(calls.runtimes, 1);
  assert.equal(calls.initialize, 1);
  assert.equal(calls.runtimeOptions.client, client);
  assert.equal(calls.runtimeOptions.lifecycleTarget, adapters.lifecycleTarget);
  assert.equal(calls.clientOptions.document, adapters.document);
  assert.equal(calls.clientOptions.fetch, adapters.fetch);
});

test("delegates only controlled view, command, status, and clear methods", async () => {
  const { entry, calls } = createHarness();
  const command = { decision: "accept" };
  await entry.start({});

  const view = await entry.readReviewView();
  const result = await entry.submitReview(command);
  entry.clear();
  entry.clear();

  assert.deepEqual(view, {
    status: "ready",
    code: null,
    view: { synthetic: true }
  });
  assert.equal(result.result.status, "accepted");
  assert.deepEqual(calls.submit, [command]);
  assert.equal(calls.read, 1);
  assert.equal(calls.clear, 1);
  assert.deepEqual(entry.status(), { status: "cleared", code: null });
  assert.deepEqual(Object.keys(entry).sort(), [
    "clear",
    "readReviewView",
    "start",
    "status",
    "submitReview"
  ]);
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.hasOwn(entry, "client"), false);
  assert.equal(Object.hasOwn(entry, "runtime"), false);
});

test("before start and after early clear expose only unavailable outcomes", async () => {
  const { entry, calls } = createHarness();

  assert.equal((await entry.readReviewView()).code, "entry.session.unavailable");
  assert.equal(
    (await entry.submitReview({})).code,
    "entry.session.unavailable"
  );
  entry.clear();
  assert.equal((await entry.start({})).code, "entry.start.unavailable");
  assert.equal(calls.clients, 0);
  assert.deepEqual(entry.status(), { status: "cleared", code: null });
});

test("construction and initialization failures are sanitized and cannot retry", async () => {
  const privateLikeError = new Error("private provider and token detail");
  const construction = createHarness({ createClientError: privateLikeError });
  const failedConstruction = await construction.entry.start({});
  const failedRetry = await construction.entry.start({});
  const initialization = createHarness({
    initializeResult: {
      status: "rejected",
      code: "runtime.bootstrap.denied"
    }
  });
  const failedInitialization = await initialization.entry.start({});

  assert.deepEqual(failedConstruction, {
    status: "rejected",
    code: "entry.start.failed"
  });
  assert.equal(failedRetry.code, "entry.start.unavailable");
  assert.equal(JSON.stringify(failedConstruction).includes("private"), false);
  assert.equal(failedInitialization.code, "runtime.bootstrap.denied");
  assert.equal((await initialization.entry.start({})).code, "entry.start.unavailable");
});

test("module import creates no global capability and remains idle", () => {
  assert.deepEqual(classifierReviewEntryStatus(), {
    status: "idle",
    code: null
  });
  for (const name of [
    "nexusClassifierReview",
    "classifierReviewRuntime",
    "classifierReviewToken"
  ]) {
    assert.equal(Object.hasOwn(globalThis, name), false);
  }
});

test("requires explicit valid factories", () => {
  assert.throws(
    () => createClassifierReviewEntry({ createClient: null }),
    /client and runtime factories/
  );
  assert.throws(
    () => createClassifierReviewEntry({ createRuntime: null }),
    /client and runtime factories/
  );
});
