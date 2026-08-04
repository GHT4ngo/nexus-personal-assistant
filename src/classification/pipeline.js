import { validateRecord } from "../domain/validation.js";
import { createClassifierAdapter } from "./adapter.js";
import {
  createClassifierSuggestionRecords
} from "./suggestion-records.js";

const diagnostic = (record, code) => ({
  recordId: typeof record?.recordId === "string" ? record.recordId : null,
  code
});

export const createClassificationPipeline = ({
  adapter = createClassifierAdapter(),
  now = () => new Date().toISOString()
} = {}) => ({
  classifyRecords: async (records = []) => {
    const suggestions = [];
    const skipped = [];
    const failures = [];
    let processed = 0;

    for (const record of records) {
      if (record?.recordType !== "message") {
        skipped.push(diagnostic(record, "record.not-message"));
        continue;
      }
      const validation = validateRecord(record);
      if (!validation.valid) {
        skipped.push(diagnostic(record, "record.invalid"));
        continue;
      }

      try {
        const classification = await adapter.classify(record);
        suggestions.push(...createClassifierSuggestionRecords({
          classification,
          subjectRecordId: record.recordId,
          observedAt: record.receivedAt,
          normalizedAt: now()
        }));
        processed += 1;
      } catch {
        failures.push(diagnostic(record, "classifier.failed"));
      }
    }

    return {
      suggestions,
      diagnostics: {
        skipped,
        failures
      },
      summary: {
        received: records.length,
        processed,
        skipped: skipped.length,
        failed: failures.length,
        suggestions: suggestions.length,
        classifierEnabled: adapter.isEnabled()
      }
    };
  },
  clearCache: () => adapter.clearCache(),
  isEnabled: () => adapter.isEnabled(),
  setEnabled: (value) => adapter.setEnabled(value)
});
