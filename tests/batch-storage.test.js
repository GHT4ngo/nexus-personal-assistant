import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeGoogleBatch
} from "../scripts/connectors/google/batch.js";
import {
  normalizeGmailMessage
} from "../scripts/connectors/google/normalize.js";
import {
  mergeStoredRecords
} from "../scripts/storage/record-store.js";
import {
  gmailMessageFixture,
  NORMALIZED_AT
} from "./fixtures/google-fixtures.js";

test("normalizes a mixed batch without failing accepted records", () => {
  const duplicate = { ...gmailMessageFixture };
  const invalid = { ...gmailMessageFixture, id: "synthetic-invalid", from: "" };
  const result = normalizeGoogleBatch(
    [gmailMessageFixture, invalid, duplicate],
    normalizeGmailMessage,
    { normalizedAt: NORMALIZED_AT }
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].sourceId, "synthetic-invalid");
  assert.ok(result.failures[0].errors.some((item) => item.path === "from"));
  assert.deepEqual(result.duplicates, [{ recordId: "gmail:synthetic-message-001" }]);
});

test("batch failures contain no provider content", () => {
  const privateLikeText = "synthetic text that must not appear in diagnostics";
  const invalid = {
    ...gmailMessageFixture,
    id: "synthetic-redacted",
    from: "",
    bodyPreview: privateLikeText
  };
  const result = normalizeGoogleBatch([invalid], normalizeGmailMessage, {
    normalizedAt: NORMALIZED_AT
  });

  assert.equal(JSON.stringify(result.failures).includes(privateLikeText), false);
});

test("storage rejects invalid records and retains valid records", () => {
  const valid = normalizeGoogleBatch([gmailMessageFixture], normalizeGmailMessage, {
    normalizedAt: NORMALIZED_AT
  }).records[0];
  const invalid = { ...valid, from: "" };
  const result = mergeStoredRecords([], [valid, invalid]);

  assert.deepEqual(result.records, [valid]);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].origin, "incoming");
});

test("storage deterministically keeps the newer normalization", () => {
  const oldRecord = normalizeGoogleBatch([gmailMessageFixture], normalizeGmailMessage, {
    normalizedAt: "2026-08-03T09:00:00.000Z"
  }).records[0];
  const newerRecord = {
    ...oldRecord,
    title: "Updated synthetic title",
    processing: {
      ...oldRecord.processing,
      normalizedAt: "2026-08-03T11:00:00.000Z"
    }
  };
  const olderReplay = {
    ...oldRecord,
    title: "Older replay",
    processing: {
      ...oldRecord.processing,
      normalizedAt: "2026-08-03T08:00:00.000Z"
    }
  };

  const result = mergeStoredRecords([oldRecord], [newerRecord, olderReplay]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].title, "Updated synthetic title");
});
