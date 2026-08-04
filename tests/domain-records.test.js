import assert from "node:assert/strict";
import test from "node:test";

import {
  createCalendarEventRecord,
  createMessageRecord,
  indexRecords
} from "../src/domain/records.js";
import {
  RecordValidationError,
  validateRecord
} from "../src/domain/validation.js";
import {
  normalizeGmailMessage,
  normalizeGoogleCalendarEvent
} from "../scripts/connectors/google/normalize.js";
import {
  calendarEventFixture,
  gmailMessageFixture,
  NORMALIZED_AT
} from "./fixtures/google-fixtures.js";

test("normalizes a synthetic Gmail message into a valid record", () => {
  const record = normalizeGmailMessage(gmailMessageFixture, { normalizedAt: NORMALIZED_AT });

  assert.equal(record.recordId, "gmail:synthetic-message-001");
  assert.equal(record.recordType, "message");
  assert.equal(record.receivedAt, "2026-08-03T08:30:00.000Z");
  assert.deepEqual(record.attachmentNames, ["instructions.pdf"]);
  assert.equal(record.hasListUnsubscribe, true);
  assert.deepEqual(validateRecord(record), { valid: true, errors: [] });
});

test("normalizes a synthetic Google Calendar event into a valid record", () => {
  const record = normalizeGoogleCalendarEvent(calendarEventFixture, { normalizedAt: NORMALIZED_AT });

  assert.equal(record.recordId, "google-calendar:synthetic-event-001");
  assert.equal(record.recordType, "calendar-event");
  assert.equal(record.startAt, "2026-08-04T14:00:00.000Z");
  assert.equal(record.location, "Example library");
  assert.equal(record.allDay, false);
  assert.deepEqual(validateRecord(record), { valid: true, errors: [] });
});

test("preserves an all-day calendar event explicitly", () => {
  const record = normalizeGoogleCalendarEvent({
    ...calendarEventFixture,
    id: "synthetic-all-day",
    start: "2026-08-05",
    end: "2026-08-06"
  }, { normalizedAt: NORMALIZED_AT });

  assert.equal(record.startAt, "2026-08-05T00:00:00.000Z");
  assert.equal(record.allDay, true);
});

test("rejects an incomplete message with explicit field errors", () => {
  assert.throws(
    () => createMessageRecord({
      sourceId: "synthetic-incomplete",
      title: "Incomplete",
      receivedAt: "2026-08-03T08:30:00.000Z",
      from: "",
      normalizedAt: NORMALIZED_AT
    }),
    (error) => {
      assert.ok(error instanceof RecordValidationError);
      assert.ok(error.errors.some((item) => item.path === "from" && item.code === "field.required"));
      return true;
    }
  );
});

test("rejects malformed dates before a record is created", () => {
  assert.throws(
    () => createCalendarEventRecord({
      sourceId: "synthetic-malformed",
      title: "Malformed date",
      startAt: "not-a-date",
      normalizedAt: NORMALIZED_AT
    }),
    /startAt must contain a valid date/
  );
});

test("normalization retains only list-header presence, not its value", () => {
  const privateLikeHeader = "https://example.test/unsubscribe/synthetic-private-token";
  const record = normalizeGmailMessage({
    ...gmailMessageFixture,
    hasListUnsubscribe: Boolean(privateLikeHeader)
  }, { normalizedAt: NORMALIZED_AT });

  assert.equal(record.hasListUnsubscribe, true);
  assert.doesNotMatch(JSON.stringify(record), /synthetic-private-token/);
});

test("rejects an event whose end precedes its start", () => {
  assert.throws(
    () => createCalendarEventRecord({
      sourceId: "synthetic-backwards",
      title: "Backwards event",
      startAt: "2026-08-04T15:00:00.000Z",
      endAt: "2026-08-04T14:00:00.000Z",
      normalizedAt: NORMALIZED_AT
    }),
    (error) => {
      assert.ok(error instanceof RecordValidationError);
      assert.ok(error.errors.some((item) => item.code === "date.order"));
      return true;
    }
  );
});

test("handles duplicate records deterministically by keeping the first", () => {
  const first = normalizeGmailMessage(gmailMessageFixture, { normalizedAt: NORMALIZED_AT });
  const second = { ...first, title: "Later duplicate" };
  const result = indexRecords([first, second]);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].title, "Synthetic assignment reminder");
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].recordId, first.recordId);
});
