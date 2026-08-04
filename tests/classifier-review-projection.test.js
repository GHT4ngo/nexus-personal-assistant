import assert from "node:assert/strict";
import test from "node:test";

import { projectClassifierReviews } from "../src/classification/review-projection.js";
import {
  createClassifierReviewDecisionRecord,
  createClassifierSuggestionRecord,
  createReviewDecisionRecord
} from "../src/domain/records.js";

const NOW = "2026-08-04T12:00:00.000Z";
const HASH = "a".repeat(64);

const suggestion = ({
  label,
  value,
  abstained = false,
  evidence = value === false || value === null ? [] : ["synthetic evidence"],
  sourceId = `synthetic-${label}`
}) => createClassifierSuggestionRecord({
  sourceId,
  title: `Synthetic ${label} suggestion`,
  subjectRecordId: "gmail:synthetic-message",
  suggestionType: label,
  suggestedValue: value,
  confidence: abstained ? 0 : 0.9,
  evidence,
  abstained,
  modelVersion: "synthetic-classifier/1",
  contentHash: HASH,
  observedAt: NOW,
  normalizedAt: NOW
});

const decision = (subjectRecordId, action, seconds, correctedValue = null) =>
  createClassifierReviewDecisionRecord({
    sourceId: `synthetic-${action}-${seconds}`,
    title: `Synthetic ${action}`,
    subjectRecordId,
    decision: action,
    correctedValue,
    decidedAt: new Date(Date.parse(NOW) + seconds * 1000).toISOString(),
    normalizedAt: new Date(Date.parse(NOW) + seconds * 1000).toISOString()
  });

test("separates unresolved regular and abstained suggestions into review queues", () => {
  const reply = suggestion({ label: "needsReply", value: true });
  const calendar = suggestion({
    label: "calendarCandidate",
    value: null,
    abstained: true
  });
  const result = projectClassifierReviews([calendar, reply]);

  assert.deepEqual(result.summary, {
    total: 2,
    pending: 1,
    abstained: 1,
    resolved: 0
  });
  assert.equal(result.queues.pending[0].suggestion.recordId, reply.recordId);
  assert.equal(result.queues.abstained[0].suggestion.recordId, calendar.recordId);
  assert.equal(result.queues.pending[0].effectiveValue, null);
});

test("uses the latest classifier review decision deterministically", () => {
  const item = suggestion({ label: "topic", value: "work" });
  const accepted = decision(item.recordId, "accept", 1);
  const corrected = decision(item.recordId, "correct", 2, "study");
  const result = projectClassifierReviews([corrected, item, accepted]);
  const projected = result.items[0];

  assert.equal(projected.status, "corrected");
  assert.equal(projected.effectiveValue, "study");
  assert.equal(projected.latestDecision.recordId, corrected.recordId);
});

test("accept exposes the suggestion value without creating a new record", () => {
  const item = suggestion({ label: "urgent", value: true });
  const accepted = decision(item.recordId, "accept", 1);
  const records = [item, accepted];
  const result = projectClassifierReviews(records);

  assert.equal(result.items[0].status, "accepted");
  assert.equal(result.items[0].effectiveValue, true);
  assert.equal(records.length, 2);
  assert.equal(result.queues.resolved.length, 1);
});

test("dismiss and not-enough-information resolve without an effective value", () => {
  const dismissedSuggestion = suggestion({ label: "automated", value: true });
  const uncertainSuggestion = suggestion({
    label: "calendarCandidate",
    value: null,
    abstained: true,
    sourceId: "synthetic-uncertain-calendar"
  });
  const result = projectClassifierReviews([
    dismissedSuggestion,
    uncertainSuggestion,
    decision(dismissedSuggestion.recordId, "dismiss", 1),
    decision(uncertainSuggestion.recordId, "not-enough-information", 2)
  ]);

  assert.deepEqual(
    result.items.map((item) => [item.status, item.effectiveValue]).sort(),
    [["dismissed", null], ["not-enough-information", null]]
  );
  assert.equal(result.summary.resolved, 2);
});

test("ignores manual organization reviews and reviews for absent suggestions", () => {
  const item = suggestion({ label: "topic", value: "work" });
  const manual = createReviewDecisionRecord({
    sourceId: "synthetic-manual-review",
    title: "Synthetic manual review",
    subjectRecordId: item.recordId,
    decision: "dismiss",
    decidedAt: NOW,
    normalizedAt: NOW
  });
  const unrelated = decision("nexus-classifier:absent", "accept", 1);
  const result = projectClassifierReviews([item, manual, unrelated]);

  assert.equal(result.items[0].status, "pending");
  assert.equal(result.items[0].latestDecision, null);
  assert.equal(result.summary.total, 1);
});

test("projection is pure and leaves source records unchanged", () => {
  const item = suggestion({ label: "topic", value: "work" });
  const accepted = decision(item.recordId, "accept", 1);
  const records = [item, accepted];
  const before = structuredClone(records);

  projectClassifierReviews(records);

  assert.deepEqual(records, before);
});
