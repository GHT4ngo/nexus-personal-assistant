import { indexRecords } from "../../../src/domain/records.js";

const failureDetails = (error) => {
  if (Array.isArray(error?.errors)) {
    return error.errors.map(({ path, code, message }) => ({ path, code, message }));
  }
  return [{
    path: "$",
    code: "normalization.failed",
    message: error?.message || "Record normalization failed."
  }];
};

export const normalizeGoogleBatch = (items, normalizer, options = {}) => {
  const normalized = [];
  const failures = [];

  items.forEach((item, index) => {
    try {
      normalized.push(normalizer(item, options));
    } catch (error) {
      failures.push({
        index,
        sourceId: typeof item?.id === "string" ? item.id : null,
        errors: failureDetails(error)
      });
    }
  });

  const indexed = indexRecords(normalized);
  return {
    records: indexed.records,
    failures,
    duplicates: indexed.duplicates.map(({ recordId }) => ({ recordId }))
  };
};

export const batchSummary = (batch, received) => ({
  received,
  accepted: batch.records.length,
  failed: batch.failures.length,
  duplicate: batch.duplicates.length
});
