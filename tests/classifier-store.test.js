import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createClassifierAdapter } from "../src/classification/adapter.js";
import { createClassifierSuggestionRecords } from "../src/classification/suggestion-records.js";
import {
  createClassifierReviewDecisionRecord,
  createReviewDecisionRecord
} from "../src/domain/records.js";
import {
  ClassifierStoreError,
  createClassifierStore
} from "../scripts/storage/classifier-store.js";

const NOW = "2026-08-04T12:00:00.000Z";

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-classifier-store-"));
  const filePath = join(directory, "private", "classifier.json");
  const classification = await createClassifierAdapter({ enabled: true }).classify({
    title: "Synthetic project review",
    text: "Can you attend the project review on 2026-08-07 at 10:30?",
    from: "Example Colleague <colleague@example.test>",
    receivedAt: NOW,
    hasListUnsubscribe: false
  });
  const suggestions = createClassifierSuggestionRecords({
    classification,
    subjectRecordId: "gmail:synthetic-message",
    observedAt: NOW,
    normalizedAt: NOW
  });
  return {
    directory,
    filePath,
    suggestions,
    store: createClassifierStore({
      filePath,
      now: () => new Date(NOW)
    })
  };
};

test("requires an explicit private store path", () => {
  assert.throws(() => createClassifierStore(), /explicit filePath/);
});

test("starts empty and persists suggestions idempotently with private permissions", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));

  assert.deepEqual(await context.store.read(), {
    schemaVersion: 1,
    updatedAt: null,
    suggestions: [],
    reviews: []
  });

  const first = await context.store.appendSuggestions(context.suggestions);
  const second = await context.store.appendSuggestions(context.suggestions);

  assert.equal(first.accepted.length, 6);
  assert.equal(second.accepted.length, 0);
  assert.equal(second.idempotent.length, 6);
  assert.equal(second.store.suggestions.length, 6);
  assert.equal((await stat(context.filePath)).mode & 0o777, 0o600);
  assert.equal((await stat(join(context.directory, "private"))).mode & 0o777, 0o700);
  assert.deepEqual(
    (await readdir(join(context.directory, "private"))).filter((name) => name.endsWith(".tmp")),
    []
  );
});

test("rejects conflicting suggestion IDs without replacing immutable history", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  await context.store.appendSuggestions([context.suggestions[0]]);

  const conflicting = {
    ...context.suggestions[0],
    confidence: context.suggestions[0].confidence === 1 ? 0.9 : 1
  };
  const result = await context.store.appendSuggestions([conflicting]);

  assert.deepEqual(result.rejected, [{
    collection: "suggestions",
    index: 0,
    recordId: conflicting.recordId,
    code: "record.conflict"
  }]);
  assert.deepEqual(result.store.suggestions, [context.suggestions[0]]);
});

test("appends classifier reviews without replacing prior decisions", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const subjectRecordId = context.suggestions[0].recordId;
  const reviews = ["accept", "dismiss"].map((decision, index) =>
    createClassifierReviewDecisionRecord({
      sourceId: `synthetic-review-${index}`,
      title: `Synthetic ${decision} review`,
      subjectRecordId,
      decision,
      decidedAt: new Date(Date.parse(NOW) + index * 1000).toISOString(),
      normalizedAt: new Date(Date.parse(NOW) + index * 1000).toISOString()
    }));

  await context.store.appendReviews([reviews[0]]);
  const result = await context.store.appendReviews(reviews);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.idempotent.length, 1);
  assert.deepEqual(result.store.reviews, reviews);
});

test("rejects wrong record kinds with content-free diagnostics", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const manualReview = createReviewDecisionRecord({
    sourceId: "private-secret-value",
    title: "Private secret title",
    subjectRecordId: "message:private",
    decision: "pin",
    decidedAt: NOW,
    normalizedAt: NOW
  });

  const result = await context.store.appendReviews([
    manualReview,
    { recordId: "malformed:private-secret-value", text: "private message body" }
  ]);

  assert.deepEqual(result.rejected.map((entry) => entry.code), [
    "record.invalid",
    "record.invalid"
  ]);
  assert.ok(!JSON.stringify(result.rejected).includes("Private secret title"));
  assert.ok(!JSON.stringify(result.rejected).includes("private message body"));
  assert.equal(result.store.reviews.length, 0);
});

test("fails closed on malformed storage and does not overwrite it", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  await mkdir(join(context.directory, "private"));
  await writeFile(context.filePath, "{private malformed content", { mode: 0o600 });

  await assert.rejects(
    context.store.appendSuggestions(context.suggestions),
    (error) => error instanceof ClassifierStoreError
      && error.code === "store.invalid"
      && !error.message.includes("private malformed content")
  );
  assert.equal(await readFile(context.filePath, "utf8"), "{private malformed content");
});

test("never accepts action or organization records into classifier collections", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));

  const result = await context.store.appendSuggestions([{
    ...context.suggestions[0],
    recordType: "task"
  }]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].code, "record.invalid");
  assert.equal(result.store.suggestions.length, 0);
});
