import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewUi
} from "../scripts/browser/classifier-review-ui.js";

const document = { createElement() {} };
const root = {
  replaceChildren() {},
  addEventListener() {},
  removeEventListener() {}
};

const createHarness = ({
  entryStart = async () => ({ status: "ready", code: null }),
  rendererRefresh = async () => ({ status: "ready", code: null }),
  rendererActivate = async () => ({ status: "ready", code: null })
} = {}) => {
  const calls = [];
  let actionHandler;
  const entry = {
    start: async (options) => {
      calls.push({ entryStart: options });
      return await entryStart(options);
    },
    readReviewView: async () => {
      calls.push({ entryRead: true });
    },
    submitReview: async (command) => {
      calls.push({ entrySubmit: command });
    },
    clear: () => {
      calls.push({ entryClear: true });
    }
  };
  const dom = {
    clear: () => {
      calls.push({ domClear: true });
    }
  };
  const renderer = {
    refresh: async () => {
      calls.push({ rendererRefresh: true });
      return await rendererRefresh();
    },
    activate: async (action) => {
      calls.push({ rendererActivate: action });
      return await rendererActivate(action);
    },
    clear: () => {
      calls.push({ rendererClear: true });
    }
  };
  const ui = createClassifierReviewUi({
    document,
    root,
    entry,
    createDom: ({ document: receivedDocument, root: receivedRoot, onAction }) => {
      calls.push({
        createDom: true,
        document: receivedDocument,
        root: receivedRoot
      });
      actionHandler = onAction;
      return dom;
    },
    createRenderer: ({ entry: receivedEntry, dom: receivedDom }) => {
      calls.push({
        createRenderer: true,
        entry: receivedEntry,
        dom: receivedDom
      });
      return renderer;
    },
    generateCommandId: () => "123e4567-e89b-42d3-a456-426614174101"
  });
  return {
    ui,
    calls,
    action: (...args) => actionHandler(...args)
  };
};

test("starts the private entry before rendering exactly once", async () => {
  const { ui, calls } = createHarness();
  const options = { now: () => 123 };

  assert.deepEqual(ui.status(), { status: "idle", code: null });
  assert.deepEqual(await ui.start(options), { status: "ready", code: null });
  assert.deepEqual(await ui.start({ ignored: true }), { status: "ready", code: null });
  assert.deepEqual(ui.status(), { status: "ready", code: null });
  assert.deepEqual(
    calls.filter((call) => call.entryStart),
    [{ entryStart: options }]
  );
  assert.equal(calls.filter((call) => call.rendererRefresh).length, 1);
  assert.ok(
    calls.findIndex((call) => call.entryStart)
      < calls.findIndex((call) => call.rendererRefresh)
  );
});

test("bridges actions only after readiness", async () => {
  let resolveStart;
  const entryStarting = new Promise((resolve) => {
    resolveStart = resolve;
  });
  const { ui, calls, action } = createHarness({
    entryStart: async () => await entryStarting
  });
  const starting = ui.start();

  assert.deepEqual(await action({ decision: "accept" }), {
    status: "rejected",
    code: "ui.action.unavailable"
  });
  resolveStart({ status: "ready", code: null });
  await starting;
  assert.deepEqual(await action({ itemId: "review-1", decision: "dismiss" }), {
    status: "ready",
    code: null
  });
  assert.deepEqual(
    calls.filter((call) => call.rendererActivate),
    [{
      rendererActivate: {
        itemId: "review-1",
        decision: "dismiss"
      }
    }]
  );
});

test("passes only controlled entry methods to the renderer", async () => {
  const { ui, calls } = createHarness();
  const created = calls.find((call) => call.createRenderer);

  assert.deepEqual(Object.keys(created.entry).sort(), [
    "readReviewView",
    "submitReview"
  ]);
  await created.entry.readReviewView();
  await created.entry.submitReview({ decision: "accept" });
  assert.equal(calls.filter((call) => call.entryRead).length, 1);
  assert.equal(calls.filter((call) => call.entrySubmit).length, 1);
  ui.clear();
});

test("fails closed and tears down all layers when entry startup is denied", async () => {
  const { ui, calls } = createHarness({
    entryStart: async () => ({
      status: "rejected",
      code: "private-entry-detail"
    })
  });

  assert.deepEqual(await ui.start(), {
    status: "rejected",
    code: "ui.entry.unavailable"
  });
  assert.deepEqual(ui.status(), {
    status: "failed",
    code: "ui.start.failed"
  });
  assert.equal(calls.filter((call) => call.rendererRefresh).length, 0);
  assert.equal(calls.filter((call) => call.rendererClear).length, 1);
  assert.equal(calls.filter((call) => call.domClear).length, 1);
  assert.equal(calls.filter((call) => call.entryClear).length, 1);
  assert.equal(JSON.stringify(calls).includes("private-entry-detail"), false);
  assert.equal((await ui.start()).code, "ui.start.unavailable");
});

test("fails closed and tears down all layers when initial refresh fails", async () => {
  for (const rendererRefresh of [
    async () => ({ status: "rejected", code: "private-view-detail" }),
    async () => {
      throw new Error("private-view-exception");
    }
  ]) {
    const { ui, calls } = createHarness({ rendererRefresh });

    assert.deepEqual(await ui.start(), {
      status: "rejected",
      code: "ui.view.unavailable"
    });
    assert.equal(calls.filter((call) => call.rendererClear).length, 1);
    assert.equal(calls.filter((call) => call.domClear).length, 1);
    assert.equal(calls.filter((call) => call.entryClear).length, 1);
    assert.equal(JSON.stringify(ui.status()).includes("private"), false);
  }
});

test("clear during entry startup wins over late readiness", async () => {
  let resolveStart;
  const entryStarting = new Promise((resolve) => {
    resolveStart = resolve;
  });
  const { ui, calls } = createHarness({
    entryStart: async () => await entryStarting
  });
  const starting = ui.start();
  ui.clear();
  resolveStart({ status: "ready", code: null });

  assert.deepEqual(await starting, {
    status: "rejected",
    code: "ui.start.unavailable"
  });
  assert.deepEqual(ui.status(), { status: "cleared", code: null });
  assert.equal(calls.filter((call) => call.rendererRefresh).length, 0);
  assert.equal(calls.filter((call) => call.rendererClear).length, 1);
  assert.equal(calls.filter((call) => call.domClear).length, 1);
  assert.equal(calls.filter((call) => call.entryClear).length, 1);
});

test("clear during refresh wins and cannot restore readiness", async () => {
  let resolveRefresh;
  const refreshing = new Promise((resolve) => {
    resolveRefresh = resolve;
  });
  const { ui, calls } = createHarness({
    rendererRefresh: async () => await refreshing
  });
  const starting = ui.start();
  await Promise.resolve();
  ui.clear();
  resolveRefresh({ status: "ready", code: null });

  assert.deepEqual(await starting, {
    status: "rejected",
    code: "ui.start.unavailable"
  });
  assert.deepEqual(ui.status(), { status: "cleared", code: null });
  assert.equal(calls.filter((call) => call.rendererClear).length, 1);
  assert.equal(calls.filter((call) => call.domClear).length, 1);
  assert.equal(calls.filter((call) => call.entryClear).length, 1);
});

test("explicit clear is coordinated and idempotent", async () => {
  const { ui, calls, action } = createHarness();
  await ui.start();
  ui.clear();
  ui.clear();

  assert.deepEqual(ui.status(), { status: "cleared", code: null });
  assert.equal(calls.filter((call) => call.rendererClear).length, 1);
  assert.equal(calls.filter((call) => call.domClear).length, 1);
  assert.equal(calls.filter((call) => call.entryClear).length, 1);
  assert.equal((await ui.start()).code, "ui.start.unavailable");
  assert.equal((await action({ decision: "accept" })).code, "ui.action.unavailable");
});

test("requires explicit browser roots, entrypoint, and valid factories", () => {
  const entry = {
    start() {},
    readReviewView() {},
    submitReview() {},
    clear() {}
  };
  assert.throws(() => createClassifierReviewUi(), /requires a document/);
  assert.throws(
    () => createClassifierReviewUi({ document }),
    /explicit root element/
  );
  assert.throws(
    () => createClassifierReviewUi({ document, root, entry: {} }),
    /controlled entrypoint/
  );
  assert.throws(
    () => createClassifierReviewUi({
      document,
      root,
      entry,
      createDom: "invalid"
    }),
    /DOM and renderer factories/
  );
  assert.throws(
    () => createClassifierReviewUi({
      document,
      root,
      entry,
      generateCommandId: "invalid"
    }),
    /command ID generator/
  );
  assert.throws(
    () => createClassifierReviewUi({
      document,
      root,
      entry,
      createDom: () => ({}),
      createRenderer: () => ({})
    }),
    /invalid adapters/
  );
});
