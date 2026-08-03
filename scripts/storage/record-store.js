import { validateRecord } from "../../src/domain/validation.js";

const newestRecord = (existing, incoming) =>
  incoming.processing.normalizedAt > existing.processing.normalizedAt ? incoming : existing;

export const mergeStoredRecords = (existingRecords = [], incomingRecords = []) => {
  const byId = new Map();
  const rejected = [];

  for (const [origin, records] of [
    ["existing", existingRecords],
    ["incoming", incomingRecords]
  ]) {
    records.forEach((record, index) => {
      const result = validateRecord(record);
      if (!result.valid) {
        rejected.push({
          origin,
          index,
          recordId: typeof record?.recordId === "string" ? record.recordId : null,
          errors: result.errors
        });
        return;
      }

      const current = byId.get(record.recordId);
      byId.set(record.recordId, current ? newestRecord(current, record) : record);
    });
  }

  return {
    records: [...byId.values()].sort((left, right) => left.recordId.localeCompare(right.recordId)),
    rejected
  };
};
