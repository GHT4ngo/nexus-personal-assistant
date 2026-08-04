export const BINARY_LABELS = [
  "needsReply",
  "hasDeadline",
  "calendarCandidate",
  "urgent",
  "automated"
];

export const TOPICS = [
  "study",
  "work",
  "finance",
  "travel",
  "health",
  "personal",
  "other"
];

const isNullableBoolean = (value) => value === null || typeof value === "boolean";

export const validateEvaluationDataset = (dataset) => {
  const errors = [];
  if (dataset?.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!dataset?.datasetId || typeof dataset.datasetId !== "string") {
    errors.push("datasetId is required.");
  }
  if (!Array.isArray(dataset?.items) || dataset.items.length === 0) {
    errors.push("items must be a non-empty array.");
    return { valid: false, errors };
  }

  const ids = new Set();
  dataset.items.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!item?.id || typeof item.id !== "string") {
      errors.push(`${path}.id is required.`);
    } else if (ids.has(item.id)) {
      errors.push(`${path}.id must be unique.`);
    } else {
      ids.add(item.id);
    }
    for (const field of ["from", "subject", "text", "receivedAt"]) {
      if (typeof item?.message?.[field] !== "string") {
        errors.push(`${path}.message.${field} must be a string.`);
      }
    }
    for (const label of BINARY_LABELS) {
      if (!isNullableBoolean(item?.expected?.[label])) {
        errors.push(`${path}.expected.${label} must be boolean or null.`);
      }
    }
    if (item?.expected?.topic !== null && !TOPICS.includes(item?.expected?.topic)) {
      errors.push(`${path}.expected.topic is invalid.`);
    }
  });

  return { valid: errors.length === 0, errors };
};
