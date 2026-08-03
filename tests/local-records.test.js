import assert from "node:assert/strict";
import test from "node:test";

import {
  createActionHistoryRecord,
  createApprovalRequestRecord,
  createExtractedSignalRecord,
  createGoalRecord,
  createReviewDecisionRecord,
  createTaskRecord
} from "../src/domain/records.js";
import { validateRecord } from "../src/domain/validation.js";
import { mergeStoredRecords } from "../scripts/storage/record-store.js";
import {
  actionHistoryFixture,
  approvalRequestFixture,
  goalFixture,
  LOCAL_NOW,
  reviewDecisionFixture,
  signalFixture,
  taskFixture
} from "./fixtures/local-record-fixtures.js";

const factories = [
  ["extracted-signal", createExtractedSignalRecord, signalFixture],
  ["task", createTaskRecord, taskFixture],
  ["goal", createGoalRecord, goalFixture],
  ["review-decision", createReviewDecisionRecord, reviewDecisionFixture],
  ["approval-request", createApprovalRequestRecord, approvalRequestFixture],
  ["action-history", createActionHistoryRecord, actionHistoryFixture]
];

test("creates every local record type from synthetic data", () => {
  for (const [recordType, factory, fixture] of factories) {
    const record = factory(fixture);
    assert.equal(record.recordType, recordType);
    assert.deepEqual(validateRecord(record), { valid: true, errors: [] });
  }
});

test("normalizes local record text, timestamps, arrays, and booleans", () => {
  const task = createTaskRecord({
    ...taskFixture,
    title: "  Read   the synthetic chapter  ",
    relatedRecordIds: ["gmail:synthetic-message-001", "gmail:synthetic-message-001"]
  });
  const action = createActionHistoryRecord({
    ...actionHistoryFixture,
    reversible: 1
  });

  assert.equal(task.title, "Read the synthetic chapter");
  assert.deepEqual(task.relatedRecordIds, ["gmail:synthetic-message-001"]);
  assert.equal(task.createdAt, LOCAL_NOW);
  assert.equal(action.reversible, true);
});

test("rejects a signal without observable evidence", () => {
  assert.throws(
    () => createExtractedSignalRecord({ ...signalFixture, evidence: [] }),
    (error) => error.errors.some((item) => item.path === "evidence")
  );
});

test("requires resolution metadata when an approval leaves pending", () => {
  assert.throws(
    () => createApprovalRequestRecord({
      ...approvalRequestFixture,
      status: "approved"
    }),
    (error) => error.errors.some((item) =>
      item.path === "resolvedAt" && item.code === "field.required")
  );
});

test("persists mixed local record types and keeps the newest version", () => {
  const records = factories.map(([, factory, fixture]) => factory(fixture));
  const updatedTask = createTaskRecord({
    ...taskFixture,
    status: "done",
    normalizedAt: "2026-08-03T19:05:00.000Z"
  });
  const result = mergeStoredRecords(records, [updatedTask]);

  assert.equal(result.rejected.length, 0);
  assert.equal(result.records.length, 6);
  assert.equal(
    result.records.find((record) => record.recordId === updatedTask.recordId).status,
    "done"
  );
});

test("storage rejects an invalid local record without exposing its text", () => {
  const invalid = {
    ...createGoalRecord(goalFixture),
    status: "guessed",
    text: "Synthetic text that must not appear in rejection metadata."
  };
  const result = mergeStoredRecords([], [invalid]);

  assert.equal(result.records.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(JSON.stringify(result.rejected).includes(invalid.text), false);
  assert.ok(result.rejected[0].errors.some((item) => item.path === "status"));
});
