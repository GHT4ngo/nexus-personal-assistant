import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createClassifierReviewDecisionRecord,
  createClassifierSuggestionRecord
} from "../src/domain/records.js";
import {
  createClassifierReviewViewService
} from "../scripts/services/classifier-review-view.js";
import {
  ClassifierStoreError,
  createClassifierStore
} from "../scripts/storage/classifier-store.js";

const NOW = "2026-08-04T12:00:00.000Z";
const PRIVATE_HASH = "b".repeat(64);

const suggestion = ({
  sourceId,
  subjectRecordId = "gmail:private-provider-message-id",
  suggestionType,
  suggestedValue,
  extractedValue = null,
  confidence = 0.9,
  evidence = ["Synthetic private evidence excerpt"],
  abstained = false
}) => createClassifierSuggestionRecord({
  sourceId,
  title: "Synthetic private suggestion title",
  subjectRecordId,
  suggestionType,
  suggestedValue,
  extractedValue,
  confidence,
  evidence,
  abstained,
  modelVersion: "synthetic-private-classifier/1",
  contentHash: PRIVATE_HASH,
  observedAt: NOW,
  normalizedAt: NOW
});

const review = (subjectRecordId, decision, seconds, correctedValue = null) =>
  createClassifierReviewDecisionRecord({
    sourceId: `synthetic-private-review-${seconds}`,
    title: "Synthetic private review title",
    text: "Synthetic private review notes",
    subjectRecordId,
    decision,
    correctedValue,
    decidedAt: new Date(Date.parse(NOW) + seconds * 1000).toISOString(),
    normalizedAt: new Date(Date.parse(NOW) + seconds * 1000).toISOString()
  });

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-review-view-"));
  const store = createClassifierStore({
    filePath: join(directory, "private", "classifier.json"),
    now: () => new Date(NOW)
  });
  return {
    directory,
    store,
    service: createClassifierReviewViewService({ store })
  };
};

test("requires a read-capable classifier store", () => {
  assert.throws(
    () => createClassifierReviewViewService(),
    /requires a classifier store/
  );
});

test("returns empty ready queues for missing private storage", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));

  const result = await context.service.readReviewView();

  assert.deepEqual(result.summary, {
    total: 0,
    pending: 0,
    abstained: 0,
    resolved: 0
  });
  assert.deepEqual(result.queues, {
    pending: [],
    abstained: [],
    resolved: []
  });
  assert.deepEqual(result.storage, { status: "ready", code: null });
});

test("projects pending, abstained, and latest resolved decisions", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const pending = suggestion({
    sourceId: "synthetic-pending",
    suggestionType: "needsReply",
    suggestedValue: true
  });
  const abstained = suggestion({
    sourceId: "synthetic-abstained",
    suggestionType: "calendarCandidate",
    suggestedValue: null,
    confidence: 0,
    evidence: [],
    abstained: true
  });
  const resolved = suggestion({
    sourceId: "synthetic-resolved",
    suggestionType: "topic",
    suggestedValue: "work"
  });
  await context.store.appendSuggestions([pending, abstained, resolved]);
  await context.store.appendReviews([
    review(resolved.recordId, "accept", 1),
    review(resolved.recordId, "correct", 2, "study")
  ]);

  const result = await context.service.readReviewView();

  assert.deepEqual(result.summary, {
    total: 3,
    pending: 1,
    abstained: 1,
    resolved: 1
  });
  assert.equal(result.queues.pending[0].status, "pending");
  assert.equal(result.queues.abstained[0].status, "abstained");
  assert.equal(result.queues.resolved[0].status, "corrected");
  assert.equal(result.queues.resolved[0].effectiveValue, "study");
});

test("uses stable opaque keys and groups suggestions for the same subject", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const first = suggestion({
    sourceId: "synthetic-group-one",
    suggestionType: "needsReply",
    suggestedValue: true
  });
  const second = suggestion({
    sourceId: "synthetic-group-two",
    suggestionType: "topic",
    suggestedValue: "work"
  });
  await context.store.appendSuggestions([first, second]);

  const firstRead = await context.service.readReviewView();
  const secondRead = await context.service.readReviewView();
  const firstItems = firstRead.queues.pending;
  const secondItems = secondRead.queues.pending;

  assert.match(firstItems[0].reviewKey, /^[a-f0-9]{64}$/);
  assert.notEqual(firstItems[0].reviewKey, firstItems[1].reviewKey);
  assert.equal(firstItems[0].subjectKey, firstItems[1].subjectKey);
  assert.deepEqual(firstItems, secondItems);
});

test("excludes stored content, provenance, IDs, evidence, and content hashes", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const item = suggestion({
    sourceId: "synthetic-private-source-id",
    suggestionType: "hasDeadline",
    suggestedValue: true,
    extractedValue: "2026-08-07T10:30:00.000Z"
  });
  await context.store.appendSuggestions([item]);

  const result = await context.service.readReviewView();
  const serialized = JSON.stringify(result);

  for (const excluded of [
    "Synthetic private evidence excerpt",
    "Synthetic private suggestion title",
    "private-provider-message-id",
    "synthetic-private-source-id",
    "synthetic-private-classifier",
    PRIVATE_HASH
  ]) {
    assert.equal(serialized.includes(excluded), false);
  }
  assert.equal(serialized.includes("recordId"), false);
  assert.equal(serialized.includes("evidenceAvailable"), true);
});

test("maps known and unknown read failures to safe empty results", async () => {
  const privateLikeText = "synthetic private storage detail";
  for (const [error, expectedCode] of [
    [new ClassifierStoreError("store.invalid", privateLikeText), "store.invalid"],
    [new Error(privateLikeText), "store.failed"]
  ]) {
    const service = createClassifierReviewViewService({
      store: {
        read: async () => {
          throw error;
        }
      }
    });
    const result = await service.readReviewView();

    assert.equal(result.storage.status, "failed");
    assert.equal(result.storage.code, expectedCode);
    assert.equal(result.summary.total, 0);
    assert.equal(JSON.stringify(result).includes(privateLikeText), false);
  }
});

test("read service does not invoke classifier or mutate storage", async () => {
  const snapshot = {
    schemaVersion: 1,
    updatedAt: null,
    suggestions: [],
    reviews: []
  };
  let reads = 0;
  const store = {
    read: async () => {
      reads += 1;
      return structuredClone(snapshot);
    },
    appendSuggestions: () => assert.fail("unexpected suggestion write"),
    appendReviews: () => assert.fail("unexpected review write")
  };
  const service = createClassifierReviewViewService({ store });

  await service.readReviewView();

  assert.equal(reads, 1);
  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    updatedAt: null,
    suggestions: [],
    reviews: []
  });
});
