import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createClassifierSuggestionRecord
} from "../src/domain/records.js";
import {
  createClassifierReviewCommandService
} from "../scripts/services/classifier-review-command.js";
import {
  classifierReviewKeyFor
} from "../scripts/services/classifier-review-view.js";
import {
  ClassifierStoreError,
  createClassifierStore
} from "../scripts/storage/classifier-store.js";

const NOW = "2026-08-04T12:00:00.000Z";
const COMMAND_ONE = "123e4567-e89b-42d3-a456-426614174000";
const COMMAND_TWO = "123e4567-e89b-42d3-a456-426614174001";

const suggestion = ({
  sourceId = "synthetic-command-suggestion",
  suggestionType = "topic",
  suggestedValue = "work",
  abstained = false
} = {}) => createClassifierSuggestionRecord({
  sourceId,
  title: "Synthetic private suggestion",
  subjectRecordId: "gmail:synthetic-private-message",
  suggestionType,
  suggestedValue,
  confidence: abstained ? 0 : 0.9,
  evidence: abstained ? [] : ["Synthetic private evidence"],
  abstained,
  modelVersion: "synthetic-classifier/1",
  contentHash: "c".repeat(64),
  observedAt: NOW,
  normalizedAt: NOW
});

const fixture = async (item = suggestion()) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-review-command-"));
  const store = createClassifierStore({
    filePath: join(directory, "private", "classifier.json"),
    now: () => new Date(NOW)
  });
  await store.appendSuggestions([item]);
  return {
    directory,
    item,
    store,
    service: createClassifierReviewCommandService({
      store,
      now: () => new Date(NOW)
    })
  };
};

const commandFor = (item, overrides = {}) => ({
  reviewKey: classifierReviewKeyFor(item.recordId),
  expectedStatus: item.abstained ? "abstained" : "pending",
  commandId: COMMAND_ONE,
  decision: "accept",
  ...overrides
});

test("requires a readable and writable classifier store", () => {
  assert.throws(
    () => createClassifierReviewCommandService(),
    /requires a classifier store/
  );
});

test("appends accept, correct, dismiss, and insufficient-information reviews", async (t) => {
  const cases = [
    ["accept", null],
    ["correct", "study"],
    ["dismiss", null],
    ["not-enough-information", null]
  ];

  for (const [index, [decision, correctedValue]] of cases.entries()) {
    const item = suggestion({ sourceId: `synthetic-${decision}` });
    const context = await fixture(item);
    t.after(() => rm(context.directory, { recursive: true, force: true }));
    const response = await context.service.submitReview(commandFor(item, {
      commandId: `123e4567-e89b-42d3-a456-42661417400${index}`,
      decision,
      correctedValue
    }));
    const stored = await context.store.read();

    assert.deepEqual(response, {
      status: "accepted",
      code: null,
      idempotent: false
    });
    assert.equal(stored.reviews.length, 1);
    assert.equal(stored.reviews[0].decision, decision);
    assert.equal(stored.reviews[0].correctedValue, correctedValue);
  }
});

test("retries the same command idempotently without appending history", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const command = commandFor(context.item);

  const first = await context.service.submitReview(command);
  const retry = await context.service.submitReview(command);

  assert.equal(first.idempotent, false);
  assert.deepEqual(retry, {
    status: "accepted",
    code: null,
    idempotent: true
  });
  assert.equal((await context.store.read()).reviews.length, 1);
});

test("rejects reuse of a command ID for different content", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  await context.service.submitReview(commandFor(context.item));

  const conflict = await context.service.submitReview(commandFor(context.item, {
    decision: "dismiss"
  }));

  assert.equal(conflict.code, "review.command.conflict");
  assert.equal((await context.store.read()).reviews.length, 1);
});

test("rejects unknown and stale opaque review keys without writing", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));

  const unknown = await context.service.submitReview(commandFor(context.item, {
    reviewKey: "f".repeat(64)
  }));
  const stale = await context.service.submitReview(commandFor(context.item, {
    commandId: COMMAND_TWO,
    expectedStatus: "resolved"
  }));

  assert.equal(unknown.code, "review.key.unknown");
  assert.equal(stale.code, "review.status.invalid");
  assert.equal((await context.store.read()).reviews.length, 0);
});

test("rejects a status that changed after the view was read", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  await context.service.submitReview(commandFor(context.item));

  const stale = await context.service.submitReview(commandFor(context.item, {
    commandId: COMMAND_TWO
  }));

  assert.equal(stale.code, "review.stale");
  assert.equal((await context.store.read()).reviews.length, 1);
});

test("validates command, decision, and correction boundaries before storage writes", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const invalid = [
    commandFor(context.item, { reviewKey: "private-key" }),
    commandFor(context.item, { commandId: "private-command" }),
    commandFor(context.item, { decision: "pin" }),
    commandFor(context.item, { decision: "correct", correctedValue: null }),
    commandFor(context.item, { decision: "accept", correctedValue: "private value" })
  ];

  const responses = [];
  for (const command of invalid) {
    responses.push(await context.service.submitReview(command));
  }

  assert.deepEqual(responses.map((response) => response.code), [
    "review.key.invalid",
    "review.command.invalid",
    "review.decision.invalid",
    "review.value.invalid",
    "review.value.invalid"
  ]);
  assert.equal((await context.store.read()).reviews.length, 0);
});

test("sanitizes read and write failures without returning private details", async () => {
  const privateLikeText = "synthetic private failure detail";
  const item = suggestion();
  const failures = [
    {
      read: async () => {
        throw new ClassifierStoreError("store.invalid", privateLikeText);
      },
      appendReviews: async () => assert.fail("unexpected write")
    },
    {
      read: async () => ({ suggestions: [item], reviews: [] }),
      appendReviews: async () => {
        throw new Error(privateLikeText);
      }
    }
  ];

  const results = [];
  for (const store of failures) {
    const service = createClassifierReviewCommandService({
      store,
      now: () => new Date(NOW)
    });
    results.push(await service.submitReview(commandFor(item)));
  }

  assert.deepEqual(results.map((entry) => entry.code), [
    "store.invalid",
    "store.failed"
  ]);
  assert.equal(JSON.stringify(results).includes(privateLikeText), false);
});

test("never creates tasks, events, approvals, actions, or learning records", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  await context.service.submitReview(commandFor(context.item));

  const stored = await context.store.read();

  assert.deepEqual(stored.reviews.map((record) => record.recordType), [
    "review-decision"
  ]);
  assert.equal(stored.reviews[0].reviewKind, "classifier-suggestion");
  assert.equal(stored.reviews.some((record) =>
    ["task", "calendar-event", "approval-request", "action-history"].includes(
      record.recordType
    )),
  false);
});
