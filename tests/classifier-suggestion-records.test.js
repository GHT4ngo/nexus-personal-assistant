import assert from "node:assert/strict";
import test from "node:test";

import { createClassifierAdapter } from "../src/classification/adapter.js";
import {
  createClassifierSuggestionRecords
} from "../src/classification/suggestion-records.js";
import {
  createClassifierReviewDecisionRecord
} from "../src/domain/records.js";
import { validateRecord } from "../src/domain/validation.js";
import { mergeStoredRecords } from "../scripts/storage/record-store.js";

const NOW = "2026-08-04T12:00:00.000Z";
const MESSAGE_ID = "gmail:synthetic-message";
const message = {
  title: "Synthetic project review",
  text: "Can you attend the project review on 2026-08-07 at 10:30?",
  from: "Example Colleague <colleague@example.test>",
  receivedAt: NOW,
  hasListUnsubscribe: false
};

const suggestions = async () => {
  const adapter = createClassifierAdapter({ enabled: true });
  const classification = await adapter.classify(message);
  return createClassifierSuggestionRecords({
    classification,
    subjectRecordId: MESSAGE_ID,
    observedAt: NOW,
    normalizedAt: NOW
  });
};

test("creates one valid suggestion record per label with classifier provenance", async () => {
  const records = await suggestions();

  assert.equal(records.length, 6);
  assert.ok(records.every((record) =>
    validateRecord(record).valid
      && record.recordType === "classifier-suggestion"
      && record.subjectRecordId === MESSAGE_ID
      && record.modelVersion === "nexus-deterministic-core/4"
      && /^[a-f0-9]{64}$/.test(record.contentHash)));
});

test("suggestions remain classifier records, not human decisions", async () => {
  const records = await suggestions();
  const topic = records.find((record) => record.suggestionType === "topic");

  assert.equal(topic.abstained, false);
  assert.equal(topic.suggestedValue, "work");
  assert.ok(topic.evidence.length > 0);
  assert.ok(records.every((record) => record.recordType !== "review-decision"));
});

test("disabled classification creates no suggestion records", async () => {
  const adapter = createClassifierAdapter();
  const classification = await adapter.classify(message);

  assert.deepEqual(createClassifierSuggestionRecords({
    classification,
    subjectRecordId: MESSAGE_ID,
    observedAt: NOW,
    normalizedAt: NOW
  }), []);
});

test("persists abstentions with null values instead of guessed labels", async () => {
  const adapter = createClassifierAdapter({ enabled: true });
  const classification = await adapter.classify({
    ...message,
    title: "Maybe Friday",
    text: "Perhaps we can meet Friday, but the time is not decided."
  });
  const records = createClassifierSuggestionRecords({
    classification,
    subjectRecordId: MESSAGE_ID,
    observedAt: NOW,
    normalizedAt: NOW
  });
  const calendar = records.find((record) =>
    record.suggestionType === "calendarCandidate");

  assert.equal(calendar.abstained, true);
  assert.equal(calendar.suggestedValue, null);
  assert.equal(calendar.confidence, 0);
  assert.deepEqual(calendar.evidence, []);
  assert.equal(validateRecord(calendar).valid, true);
});

test("persists suggestions and separate review decisions without creating actions", async () => {
  const records = await suggestions();
  const subject = records.find((record) => record.suggestionType === "calendarCandidate");
  const decisions = [
    ["accept", null],
    ["correct", false],
    ["dismiss", null],
    ["not-enough-information", null]
  ].map(([decision, correctedValue], index) =>
    createClassifierReviewDecisionRecord({
      sourceId: `synthetic-review-${index}`,
      title: `Synthetic ${decision} review`,
      subjectRecordId: subject.recordId,
      decision,
      correctedValue,
      decidedAt: new Date(Date.parse(NOW) + index * 1000).toISOString(),
      normalizedAt: new Date(Date.parse(NOW) + index * 1000).toISOString()
    }));
  const stored = mergeStoredRecords([], [...records, ...decisions]);

  assert.equal(stored.rejected.length, 0);
  assert.equal(stored.records.filter((record) =>
    record.recordType === "classifier-suggestion").length, 6);
  assert.equal(stored.records.filter((record) =>
    record.recordType === "review-decision").length, 4);
  assert.equal(stored.records.some((record) =>
    ["approval-request", "action-history", "task", "calendar-event"].includes(record.recordType)),
  false);
});

test("classifier correction requires a corrected value", async () => {
  const records = await suggestions();

  assert.throws(
    () => createClassifierReviewDecisionRecord({
      sourceId: "synthetic-invalid-correction",
      title: "Invalid synthetic correction",
      subjectRecordId: records[0].recordId,
      decision: "correct",
      decidedAt: NOW,
      normalizedAt: NOW
    }),
    /correctedValue/
  );
});

test("classifier review rejects organization-only decisions", async () => {
  const records = await suggestions();

  assert.throws(
    () => createClassifierReviewDecisionRecord({
      sourceId: "synthetic-invalid-pin",
      title: "Invalid synthetic pin",
      subjectRecordId: records[0].recordId,
      decision: "pin",
      decidedAt: NOW,
      normalizedAt: NOW
    }),
    /Classifier review decision is invalid/
  );
});
