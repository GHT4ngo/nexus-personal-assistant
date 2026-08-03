import { assertValidRecord } from "./validation.js";

export const RECORD_SCHEMA_VERSION = 1;
export const NORMALIZER_VERSION = "nexus-normalizer/1";

const compactText = (value = "") => String(value).replace(/\s+/g, " ").trim();

export const toIsoTimestamp = (value, fieldName) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new TypeError(`${fieldName} must contain a valid date.`);
  }
  return date.toISOString();
};

const optionalIsoTimestamp = (value, fieldName) =>
  value === null || value === undefined || value === "" ? null : toIsoTimestamp(value, fieldName);

const baseRecord = ({
  recordType,
  source,
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  observedAt,
  normalizedAt,
  processingVersion = NORMALIZER_VERSION,
  retentionExpiresAt = null
}) => ({
  schemaVersion: RECORD_SCHEMA_VERSION,
  recordType,
  recordId: `${source}:${sourceId}`,
  source,
  sourceId: compactText(sourceId),
  title: compactText(title),
  text: compactText(text),
  sourceUrl: sourceUrl ? String(sourceUrl) : null,
  observedAt: toIsoTimestamp(observedAt, "observedAt"),
  processing: {
    version: compactText(processingVersion),
    normalizedAt: toIsoTimestamp(normalizedAt, "normalizedAt")
  },
  retention: {
    expiresAt: optionalIsoTimestamp(retentionExpiresAt, "retentionExpiresAt")
  }
});

export const createMessageRecord = ({
  source = "gmail",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  receivedAt,
  from,
  attachmentNames = [],
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const receivedTimestamp = toIsoTimestamp(receivedAt, "receivedAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "message",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: receivedTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    receivedAt: receivedTimestamp,
    from: compactText(from),
    attachmentNames: [...new Set(attachmentNames.map(compactText).filter(Boolean))].sort()
  });
};

export const createCalendarEventRecord = ({
  source = "google-calendar",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  startAt,
  endAt = null,
  location = "",
  allDay = false,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const startTimestamp = toIsoTimestamp(startAt, "startAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "calendar-event",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: startTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    startAt: startTimestamp,
    endAt: optionalIsoTimestamp(endAt, "endAt"),
    location: compactText(location),
    allDay: Boolean(allDay)
  });
};

export const indexRecords = (records) => {
  const byId = new Map();
  const duplicates = [];

  for (const record of records) {
    assertValidRecord(record);
    if (byId.has(record.recordId)) {
      duplicates.push({
        recordId: record.recordId,
        kept: byId.get(record.recordId),
        ignored: record
      });
      continue;
    }
    byId.set(record.recordId, record);
  }

  return {
    records: [...byId.values()],
    duplicates
  };
};
