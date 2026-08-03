const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const error = (path, code, message) => ({ path, code, message });

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isNullableString = (value) => value === null || typeof value === "string";
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isIsoDate = (value) =>
  typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));

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
  if (!["message", "calendar-event"].includes(record.recordType)) {
    errors.push(error("recordType", "record.type", "recordType must be message or calendar-event."));
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
