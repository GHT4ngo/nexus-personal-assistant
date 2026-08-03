const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const error = (path, code, message) => ({ path, code, message });

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isNullableString = (value) => value === null || typeof value === "string";
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isIsoDate = (value) =>
  typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
const isNullableIsoDate = (value) => value === null || isIsoDate(value);
const isOneOf = (value, allowed) => typeof value === "string" && allowed.includes(value);

export const RECORD_TYPES = [
  "message",
  "calendar-event",
  "extracted-signal",
  "task",
  "goal",
  "review-decision",
  "approval-request",
  "action-history"
];

export const validateRecord = (record) => {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      valid: false,
      errors: [error("$", "record.type", "Record must be an object.")]
    };
  }

  if (record.schemaVersion !== 1) {
    errors.push(error("schemaVersion", "schema.unsupported", "schemaVersion must be 1."));
  }
  if (!RECORD_TYPES.includes(record.recordType)) {
    errors.push(error("recordType", "record.type", `recordType must be one of: ${RECORD_TYPES.join(", ")}.`));
  }
  if (!isNonEmptyString(record.recordId)) {
    errors.push(error("recordId", "field.required", "recordId is required."));
  }
  if (!isNonEmptyString(record.sourceId)) {
    errors.push(error("sourceId", "field.required", "sourceId is required."));
  }
  if (!isNonEmptyString(record.source)) {
    errors.push(error("source", "field.required", "source is required."));
  }
  if (!isNonEmptyString(record.title)) {
    errors.push(error("title", "field.required", "title is required."));
  }
  if (typeof record.text !== "string") {
    errors.push(error("text", "field.type", "text must be a string."));
  }
  if (!isNullableString(record.sourceUrl)) {
    errors.push(error("sourceUrl", "field.type", "sourceUrl must be a string or null."));
  }
  if (!isIsoDate(record.observedAt)) {
    errors.push(error("observedAt", "date.invalid", "observedAt must be an ISO UTC timestamp."));
  }
  if (!record.processing || typeof record.processing !== "object") {
    errors.push(error("processing", "field.required", "processing metadata is required."));
  } else {
    if (!isNonEmptyString(record.processing.version)) {
      errors.push(error("processing.version", "field.required", "Processing version is required."));
    }
    if (!isIsoDate(record.processing.normalizedAt)) {
      errors.push(error(
        "processing.normalizedAt",
        "date.invalid",
        "processing.normalizedAt must be an ISO UTC timestamp."
      ));
    }
  }
  if (!record.retention || typeof record.retention !== "object") {
    errors.push(error("retention", "field.required", "Retention metadata is required."));
  } else if (record.retention.expiresAt !== null && !isIsoDate(record.retention.expiresAt)) {
    errors.push(error(
      "retention.expiresAt",
      "date.invalid",
      "retention.expiresAt must be an ISO UTC timestamp or null."
    ));
  }

  if (record.recordType === "message") {
    if (!isIsoDate(record.receivedAt)) {
      errors.push(error("receivedAt", "date.invalid", "receivedAt must be an ISO UTC timestamp."));
    }
    if (!isNonEmptyString(record.from)) {
      errors.push(error("from", "field.required", "Message sender is required."));
    }
    if (!isStringArray(record.attachmentNames)) {
      errors.push(error(
        "attachmentNames",
        "field.type",
        "attachmentNames must contain only strings."
      ));
    }
  }

  if (record.recordType === "calendar-event") {
    if (!isIsoDate(record.startAt)) {
      errors.push(error("startAt", "date.invalid", "startAt must be an ISO UTC timestamp."));
    }
    if (record.endAt !== null && !isIsoDate(record.endAt)) {
      errors.push(error("endAt", "date.invalid", "endAt must be an ISO UTC timestamp or null."));
    }
    if (typeof record.location !== "string") {
      errors.push(error("location", "field.type", "location must be a string."));
    }
    if (typeof record.allDay !== "boolean") {
      errors.push(error("allDay", "field.type", "allDay must be a boolean."));
    }
    if (isIsoDate(record.startAt) && isIsoDate(record.endAt) && record.endAt < record.startAt) {
      errors.push(error("endAt", "date.order", "endAt cannot be before startAt."));
    }
  }

  if (record.recordType === "extracted-signal") {
    if (!isNonEmptyString(record.subjectRecordId)) {
      errors.push(error("subjectRecordId", "field.required", "Signal subjectRecordId is required."));
    }
    if (!isNonEmptyString(record.signalType)) {
      errors.push(error("signalType", "field.required", "Signal type is required."));
    }
    if (!isStringArray(record.evidence) || record.evidence.length === 0) {
      errors.push(error("evidence", "field.required", "Signal evidence must contain at least one string."));
    }
    if (typeof record.value !== "string") {
      errors.push(error("value", "field.type", "Signal value must be a string."));
    }
  }

  if (record.recordType === "task") {
    if (!isOneOf(record.status, ["todo", "doing", "done", "dismissed"])) {
      errors.push(error("status", "field.enum", "Task status is invalid."));
    }
    if (!isNullableIsoDate(record.dueAt)) {
      errors.push(error("dueAt", "date.invalid", "Task dueAt must be an ISO UTC timestamp or null."));
    }
    if (!isStringArray(record.relatedRecordIds)) {
      errors.push(error("relatedRecordIds", "field.type", "Task relatedRecordIds must contain only strings."));
    }
    if (!isIsoDate(record.createdAt)) {
      errors.push(error("createdAt", "date.invalid", "Task createdAt must be an ISO UTC timestamp."));
    }
  }

  if (record.recordType === "goal") {
    if (!isOneOf(record.status, ["active", "paused", "completed", "dismissed"])) {
      errors.push(error("status", "field.enum", "Goal status is invalid."));
    }
    if (!isNullableIsoDate(record.targetAt)) {
      errors.push(error("targetAt", "date.invalid", "Goal targetAt must be an ISO UTC timestamp or null."));
    }
    if (!isStringArray(record.relatedRecordIds)) {
      errors.push(error("relatedRecordIds", "field.type", "Goal relatedRecordIds must contain only strings."));
    }
    if (!isIsoDate(record.createdAt)) {
      errors.push(error("createdAt", "date.invalid", "Goal createdAt must be an ISO UTC timestamp."));
    }
  }

  if (record.recordType === "review-decision") {
    if (!isNonEmptyString(record.subjectRecordId)) {
      errors.push(error("subjectRecordId", "field.required", "Review subjectRecordId is required."));
    }
    if (!isOneOf(record.decision, ["accept", "correct", "dismiss", "defer", "not-enough-information"])) {
      errors.push(error("decision", "field.enum", "Review decision is invalid."));
    }
    if (!isIsoDate(record.decidedAt)) {
      errors.push(error("decidedAt", "date.invalid", "Review decidedAt must be an ISO UTC timestamp."));
    }
  }

  if (record.recordType === "approval-request") {
    if (!isNonEmptyString(record.targetRecordId)) {
      errors.push(error("targetRecordId", "field.required", "Approval targetRecordId is required."));
    }
    if (!isNonEmptyString(record.actionType)) {
      errors.push(error("actionType", "field.required", "Approval actionType is required."));
    }
    if (!isOneOf(record.status, ["pending", "approved", "rejected", "cancelled"])) {
      errors.push(error("status", "field.enum", "Approval status is invalid."));
    }
    if (!isIsoDate(record.requestedAt)) {
      errors.push(error("requestedAt", "date.invalid", "Approval requestedAt must be an ISO UTC timestamp."));
    }
    if (!isNullableIsoDate(record.resolvedAt)) {
      errors.push(error("resolvedAt", "date.invalid", "Approval resolvedAt must be an ISO UTC timestamp or null."));
    }
    if (record.status === "pending" && record.resolvedAt !== null) {
      errors.push(error("resolvedAt", "state.invalid", "A pending approval cannot be resolved."));
    }
    if (record.status !== "pending" && record.resolvedAt === null) {
      errors.push(error("resolvedAt", "field.required", "A resolved approval requires resolvedAt."));
    }
  }

  if (record.recordType === "action-history") {
    if (!isNonEmptyString(record.targetRecordId)) {
      errors.push(error("targetRecordId", "field.required", "Action targetRecordId is required."));
    }
    if (!isNonEmptyString(record.actionType)) {
      errors.push(error("actionType", "field.required", "Action type is required."));
    }
    if (!isOneOf(record.outcome, ["succeeded", "failed", "cancelled"])) {
      errors.push(error("outcome", "field.enum", "Action outcome is invalid."));
    }
    if (typeof record.reversible !== "boolean") {
      errors.push(error("reversible", "field.type", "Action reversible must be a boolean."));
    }
    if (!isIsoDate(record.occurredAt)) {
      errors.push(error("occurredAt", "date.invalid", "Action occurredAt must be an ISO UTC timestamp."));
    }
  }

  return { valid: errors.length === 0, errors };
};

export class RecordValidationError extends Error {
  constructor(errors) {
    super(`Record validation failed: ${errors.map((item) => `${item.path} ${item.message}`).join("; ")}`);
    this.name = "RecordValidationError";
    this.errors = errors;
  }
}

export const assertValidRecord = (record) => {
  const result = validateRecord(record);
  if (!result.valid) {
    throw new RecordValidationError(result.errors);
  }
  return record;
};
