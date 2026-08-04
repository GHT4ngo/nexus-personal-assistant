import assert from "node:assert/strict";
import test from "node:test";

import { createClassifierAdapter } from "../src/classification/adapter.js";
import {
  createClassificationPipeline
} from "../src/classification/pipeline.js";
import {
  createCalendarEventRecord,
  createMessageRecord
} from "../src/domain/records.js";

const NOW = "2026-08-04T12:00:00.000Z";

const message = (sourceId, overrides = {}) => createMessageRecord({
  sourceId,
  title: "Synthetic project review",
  text: "Can you attend the project review on 2026-08-07 at 10:30?",
  receivedAt: NOW,
  from: "Example Colleague <colleague@example.test>",
  normalizedAt: NOW,
  ...overrides
});

test("batch pipeline is disabled by default and returns no suggestions", async () => {
  const pipeline = createClassificationPipeline({ now: () => NOW });
  const result = await pipeline.classifyRecords([message("synthetic-disabled")]);

  assert.deepEqual(result.suggestions, []);
  assert.deepEqual(result.summary, {
    received: 1,
    processed: 1,
    skipped: 0,
    failed: 0,
    suggestions: 0,
    classifierEnabled: false
  });
});

test("enabled pipeline returns in-memory suggestions without mutating input", async () => {
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled: true }),
    now: () => NOW
  });
  const records = [message("synthetic-one"), message("synthetic-two")];
  const before = structuredClone(records);
  const result = await pipeline.classifyRecords(records);

  assert.equal(result.suggestions.length, 12);
  assert.equal(result.summary.processed, 2);
  assert.deepEqual(records, before);
  assert.ok(result.suggestions.every((suggestion) =>
    suggestion.recordType === "classifier-suggestion"));
  assert.equal(new Set(result.suggestions.map((item) => item.recordId)).size, 12);
});

test("identical content on different messages produces distinct suggestion IDs", async () => {
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled: true }),
    now: () => NOW
  });
  const result = await pipeline.classifyRecords([
    message("synthetic-copy-one"),
    message("synthetic-copy-two")
  ]);
  const topics = result.suggestions.filter((item) => item.suggestionType === "topic");

  assert.equal(topics[0].contentHash, topics[1].contentHash);
  assert.notEqual(topics[0].recordId, topics[1].recordId);
  assert.notEqual(topics[0].subjectRecordId, topics[1].subjectRecordId);
});

test("skips non-message and invalid records with content-free diagnostics", async () => {
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled: true }),
    now: () => NOW
  });
  const calendar = createCalendarEventRecord({
    sourceId: "synthetic-calendar",
    title: "Synthetic calendar event",
    startAt: NOW,
    normalizedAt: NOW
  });
  const privateLikeText = "synthetic text excluded from diagnostics";
  const invalid = {
    ...message("synthetic-invalid"),
    text: privateLikeText,
    from: ""
  };
  const result = await pipeline.classifyRecords([calendar, invalid]);

  assert.deepEqual(result.diagnostics.skipped, [
    { recordId: calendar.recordId, code: "record.not-message" },
    { recordId: invalid.recordId, code: "record.invalid" }
  ]);
  assert.equal(JSON.stringify(result.diagnostics).includes(privateLikeText), false);
  assert.equal(result.summary.processed, 0);
});

test("isolates classifier failure without exposing message content", async () => {
  const privateLikeText = "synthetic provider failure content";
  const adapter = {
    classify: async (record) => {
      if (record.title.includes("Failure")) {
        throw new Error(`Provider saw ${privateLikeText}`);
      }
      return {
        classifierEnabled: false,
        cache: { hit: false, key: null }
      };
    },
    clearCache: () => {},
    isEnabled: () => true,
    setEnabled: () => {}
  };
  const pipeline = createClassificationPipeline({ adapter, now: () => NOW });
  const result = await pipeline.classifyRecords([
    message("synthetic-ok"),
    message("synthetic-failure", { title: "Synthetic Failure" })
  ]);

  assert.equal(result.summary.processed, 1);
  assert.equal(result.summary.failed, 1);
  assert.deepEqual(result.diagnostics.failures, [{
    recordId: "gmail:synthetic-failure",
    code: "classifier.failed"
  }]);
  assert.equal(JSON.stringify(result).includes(privateLikeText), false);
});

test("pipeline output contains no action-bearing record types", async () => {
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled: true }),
    now: () => NOW
  });
  const result = await pipeline.classifyRecords([message("synthetic-no-actions")]);

  assert.equal(result.suggestions.some((record) =>
    ["task", "calendar-event", "approval-request", "action-history"].includes(
      record.recordType
    )),
  false);
});
