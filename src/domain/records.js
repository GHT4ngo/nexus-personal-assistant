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

const uniqueStrings = (values = []) => [...new Set(values.map(compactText).filter(Boolean))].sort();

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
    attachmentNames: uniqueStrings(attachmentNames)
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

export const createExtractedSignalRecord = ({
  source = "nexus",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  subjectRecordId,
  signalType,
  evidence = [],
  value = "",
  observedAt,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => assertValidRecord({
  ...baseRecord({
    recordType: "extracted-signal",
    source,
    sourceId,
    title,
    text,
    sourceUrl,
    observedAt,
    normalizedAt,
    processingVersion,
    retentionExpiresAt
  }),
  subjectRecordId: compactText(subjectRecordId),
  signalType: compactText(signalType),
  evidence: uniqueStrings(evidence),
  value: compactText(value)
});

export const createTaskRecord = ({
  source = "local",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  status = "todo",
  dueAt = null,
  relatedRecordIds = [],
  createdAt,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const createdTimestamp = toIsoTimestamp(createdAt, "createdAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "task",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: createdTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    status: compactText(status),
    dueAt: optionalIsoTimestamp(dueAt, "dueAt"),
    relatedRecordIds: uniqueStrings(relatedRecordIds),
    createdAt: createdTimestamp
  });
};

export const createGoalRecord = ({
  source = "local",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  status = "active",
  targetAt = null,
  relatedRecordIds = [],
  createdAt,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const createdTimestamp = toIsoTimestamp(createdAt, "createdAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "goal",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: createdTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    status: compactText(status),
    targetAt: optionalIsoTimestamp(targetAt, "targetAt"),
    relatedRecordIds: uniqueStrings(relatedRecordIds),
    createdAt: createdTimestamp
  });
};

export const createReviewDecisionRecord = ({
  source = "local",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  subjectRecordId,
  decision,
  decidedAt,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const decidedTimestamp = toIsoTimestamp(decidedAt, "decidedAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "review-decision",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: decidedTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    subjectRecordId: compactText(subjectRecordId),
    decision: compactText(decision),
    decidedAt: decidedTimestamp
  });
};

export const createApprovalRequestRecord = ({
  source = "local",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  targetRecordId,
  actionType,
  status = "pending",
  requestedAt,
  resolvedAt = null,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const requestedTimestamp = toIsoTimestamp(requestedAt, "requestedAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "approval-request",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: requestedTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    targetRecordId: compactText(targetRecordId),
    actionType: compactText(actionType),
    status: compactText(status),
    requestedAt: requestedTimestamp,
    resolvedAt: optionalIsoTimestamp(resolvedAt, "resolvedAt")
  });
};

export const createActionHistoryRecord = ({
  source = "local",
  sourceId,
  title,
  text = "",
  sourceUrl = null,
  targetRecordId,
  actionType,
  outcome,
  reversible = false,
  occurredAt,
  normalizedAt,
  processingVersion,
  retentionExpiresAt
}) => {
  const occurredTimestamp = toIsoTimestamp(occurredAt, "occurredAt");
  return assertValidRecord({
    ...baseRecord({
      recordType: "action-history",
      source,
      sourceId,
      title,
      text,
      sourceUrl,
      observedAt: occurredTimestamp,
      normalizedAt,
      processingVersion,
      retentionExpiresAt
    }),
    targetRecordId: compactText(targetRecordId),
    actionType: compactText(actionType),
    outcome: compactText(outcome),
    reversible: Boolean(reversible),
    occurredAt: occurredTimestamp
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
