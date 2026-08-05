import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewRenderer
} from "../scripts/browser/classifier-review-renderer.js";

const item = ({
  key,
  status,
  abstained = false,
  suggestedValue = "school",
  extractedValue = null,
  effectiveValue = null
}) => ({
  reviewKey: key.repeat(64),
  subjectKey: "f".repeat(64),
  suggestionType: "topic",
  suggestedValue,
  extractedValue,
  confidence: abstained ? 0 : 0.94,
  abstained,
  evidenceAvailable: !abstained,
  status,
  effectiveValue
});

const VIEW = {
  summary: { total: 3, pending: 1, abstained: 1, resolved: 1 },
  queues: {
    pending: [item({ key: "a", status: "pending" })],
    abstained: [item({
      key: "b",
      status: "abstained",
      abstained: true,
      suggestedValue: null
    })],
    resolved: [item({
      key: "c",
      status: "accepted",
      effectiveValue: "school"
    })]
  },
  storage: { status: "ready", code: null }
};
const READY_VIEW = {
  status: "ready",
  code: null,
  view: VIEW
};

const createHarness = ({
  views = [READY_VIEW],
  submit = async () => ({
    status: "ready",
    code: null,
    result: { status: "accepted", code: null, idempotent: false }
  })
} = {}) => {
  const rendered = [];
  const announcements = [];
  const commands = [];
  let clears = 0;
  const entry = {
    readReviewView: async () => views.shift(),
    submitReview: async (command) => {
      commands.push(command);
      return await submit(command);
    }
  };
  const dom = {
    render: (model) => rendered.push(model),
    announce: (message, role) => announcements.push({ message, role }),
    clear: () => {
      clears += 1;
    }
  };
  const renderer = createClassifierReviewRenderer({
    entry,
    dom,
    generateCommandId: () => "123e4567-e89b-42d3-a456-426614174099"
  });
  return {
    renderer,
    rendered,
    announcements,
    commands,
    clearCount: () => clears
  };
};

test("renders accessible sections without exposing private command keys", async () => {
  const { renderer, rendered } = createHarness();

  assert.deepEqual(await renderer.refresh(), { status: "ready", code: null });
  assert.equal(renderer.status(), "ready");
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].heading, "Classifier review");
  assert.deepEqual(
    rendered[0].sections.map(({ key, heading, count }) => ({ key, heading, count })),
    [
      { key: "pending", heading: "Suggestions to review", count: 1 },
      { key: "abstained", heading: "Not enough information", count: 1 },
      { key: "resolved", heading: "Reviewed suggestions", count: 1 }
    ]
  );
  const pending = rendered[0].sections[0].items[0];
  assert.equal(pending.value, "school");
  assert.equal(pending.confidence, "94% confidence");
  assert.equal(pending.evidence, "Supporting evidence is available");
  assert.deepEqual(
    pending.actions.map(({ decision, label, requiresValue }) => ({
      decision,
      label,
      requiresValue
    })),
    [
      { decision: "accept", label: "Accept suggestion", requiresValue: false },
      { decision: "correct", label: "Correct suggestion", requiresValue: true },
      { decision: "dismiss", label: "Dismiss suggestion", requiresValue: false },
      {
        decision: "not-enough-information",
        label: "Not enough information",
        requiresValue: false
      }
    ]
  );
  const serialized = JSON.stringify(rendered[0]);
  assert.equal(serialized.includes("a".repeat(64)), false);
  assert.equal(serialized.includes("f".repeat(64)), false);
  assert.equal(serialized.includes("reviewKey"), false);
  assert.equal(serialized.includes("subjectKey"), false);
});

test("abstained items cannot be accepted and resolved items have no controls", async () => {
  const { renderer, rendered, commands } = createHarness();
  await renderer.refresh();
  const abstained = rendered[0].sections[1].items[0];
  const resolved = rendered[0].sections[2].items[0];

  assert.deepEqual(
    abstained.actions.map((action) => action.decision),
    ["correct", "dismiss", "not-enough-information"]
  );
  assert.deepEqual(resolved.actions, []);
  assert.equal(
    (await renderer.activate({
      itemId: abstained.itemId,
      decision: "accept"
    })).code,
    "renderer.action.invalid"
  );
  assert.equal(commands.length, 0);
});

test("submits each explicit decision with private target state", async () => {
  for (const [decision, correctedValue] of [
    ["accept", null],
    ["correct", "  study  "],
    ["dismiss", null],
    ["not-enough-information", null]
  ]) {
    const { renderer, rendered, commands, announcements } = createHarness({
      views: [READY_VIEW, READY_VIEW]
    });
    await renderer.refresh();
    const pending = rendered[0].sections[0].items[0];

    assert.deepEqual(await renderer.activate({
      itemId: pending.itemId,
      decision,
      correctedValue
    }), { status: "ready", code: null });
    assert.deepEqual(commands, [{
      reviewKey: "a".repeat(64),
      expectedStatus: "pending",
      commandId: "123e4567-e89b-42d3-a456-426614174099",
      decision,
      ...(decision === "correct" ? { correctedValue: "study" } : {})
    }]);
    assert.deepEqual(announcements, [{
      message: "Review decision saved.",
      role: "status"
    }]);
    assert.equal(rendered.length, 2);
  }
});

test("rejects unknown controls and invalid correction values without submitting", async () => {
  const { renderer, rendered, commands } = createHarness();
  await renderer.refresh();
  const itemId = rendered[0].sections[0].items[0].itemId;

  for (const action of [
    { itemId: "absent", decision: "accept" },
    { itemId, decision: "pin" },
    { itemId, decision: "correct", correctedValue: null },
    { itemId, decision: "correct", correctedValue: "   " },
    { itemId, decision: "accept", correctedValue: "private" }
  ]) {
    assert.equal((await renderer.activate(action)).status, "rejected");
  }
  assert.equal(commands.length, 0);
});

test("fails closed on unavailable views and rejected commands", async () => {
  const unavailable = createHarness({
    views: [{ status: "rejected", code: "entry.session.unavailable", view: null }]
  });
  assert.deepEqual(await unavailable.renderer.refresh(), {
    status: "rejected",
    code: "renderer.view.unavailable"
  });
  assert.equal(unavailable.renderer.status(), "failed");
  assert.equal(unavailable.clearCount(), 1);
  assert.deepEqual(unavailable.announcements, [{
    message: "Classifier review is unavailable.",
    role: "error"
  }]);

  const rejected = createHarness({
    submit: async () => ({
      status: "rejected",
      code: "review.stale",
      result: { status: "rejected", code: "review.stale", idempotent: false }
    })
  });
  await rejected.renderer.refresh();
  const itemId = rejected.rendered[0].sections[0].items[0].itemId;
  assert.deepEqual(await rejected.renderer.activate({ itemId, decision: "accept" }), {
    status: "rejected",
    code: "renderer.command.rejected"
  });
  assert.equal(rejected.renderer.status(), "ready");
  assert.deepEqual(rejected.announcements, [{
    message: "The review decision was not saved. Refresh and try again.",
    role: "error"
  }]);
});

test("sanitizes entry read and command exceptions", async () => {
  const readFailure = createHarness({
    views: [],
    submit: async () => {
      throw new Error("private provider detail");
    }
  });
  readFailure.renderer = createClassifierReviewRenderer({
    entry: {
      readReviewView: async () => {
        throw new Error("private storage path");
      },
      submitReview: async () => {}
    },
    dom: {
      render: (model) => readFailure.rendered.push(model),
      announce: (message, role) =>
        readFailure.announcements.push({ message, role }),
      clear: () => {}
    }
  });
  assert.equal(
    (await readFailure.renderer.refresh()).code,
    "renderer.view.unavailable"
  );
  assert.equal(
    JSON.stringify(readFailure.announcements).includes("private"),
    false
  );

  const commandFailure = createHarness({
    submit: async () => {
      throw new Error("private provider detail");
    }
  });
  await commandFailure.renderer.refresh();
  const itemId = commandFailure.rendered[0].sections[0].items[0].itemId;
  assert.equal(
    (await commandFailure.renderer.activate({ itemId, decision: "dismiss" })).code,
    "renderer.command.rejected"
  );
  assert.equal(
    JSON.stringify(commandFailure.announcements).includes("private"),
    false
  );
});

test("clear removes rendered state and makes the renderer unavailable", async () => {
  const { renderer, rendered, clearCount } = createHarness();
  await renderer.refresh();
  const itemId = rendered[0].sections[0].items[0].itemId;
  renderer.clear();
  renderer.clear();

  assert.equal(renderer.status(), "cleared");
  assert.equal(clearCount(), 1);
  assert.equal((await renderer.refresh()).code, "renderer.unavailable");
  assert.equal(
    (await renderer.activate({ itemId, decision: "accept" })).code,
    "renderer.unavailable"
  );
});

test("clear during a view read cannot restore rendered state", async () => {
  let resolveView;
  const reading = new Promise((resolve) => {
    resolveView = resolve;
  });
  const harness = createHarness({ views: [reading] });
  const refreshing = harness.renderer.refresh();
  harness.renderer.clear();
  resolveView(READY_VIEW);

  assert.deepEqual(await refreshing, {
    status: "rejected",
    code: "renderer.unavailable"
  });
  assert.equal(harness.renderer.status(), "cleared");
  assert.equal(harness.rendered.length, 0);
  assert.equal(harness.clearCount(), 1);
});

test("clear during command submission cannot announce or refresh", async () => {
  let resolveCommand;
  const submitting = new Promise((resolve) => {
    resolveCommand = resolve;
  });
  const harness = createHarness({
    submit: async () => await submitting
  });
  await harness.renderer.refresh();
  const itemId = harness.rendered[0].sections[0].items[0].itemId;
  const activating = harness.renderer.activate({ itemId, decision: "dismiss" });
  harness.renderer.clear();
  resolveCommand({
    status: "ready",
    code: null,
    result: { status: "accepted", code: null, idempotent: false }
  });

  assert.deepEqual(await activating, {
    status: "rejected",
    code: "renderer.unavailable"
  });
  assert.equal(harness.renderer.status(), "cleared");
  assert.equal(harness.rendered.length, 1);
  assert.deepEqual(harness.announcements, []);
  assert.equal(harness.clearCount(), 1);
});

test("requires controlled entry, DOM, and command ID adapters", () => {
  assert.throws(
    () => createClassifierReviewRenderer(),
    /controlled review entry/
  );
  assert.throws(
    () => createClassifierReviewRenderer({
      entry: { readReviewView() {}, submitReview() {} }
    }),
    /DOM adapter/
  );
  assert.throws(
    () => createClassifierReviewRenderer({
      entry: { readReviewView() {}, submitReview() {} },
      dom: { render() {}, announce() {}, clear() {} },
      generateCommandId: "not-a-function"
    }),
    /command ID generator/
  );
});
