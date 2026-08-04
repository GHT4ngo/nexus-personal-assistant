import {
  createClassificationPipeline
} from "../../src/classification/pipeline.js";

const countCodes = (diagnostics = []) => {
  const counts = {};
  for (const diagnostic of diagnostics) {
    const code = typeof diagnostic?.code === "string"
      ? diagnostic.code
      : "diagnostic.invalid";
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
};

const storageFailureCode = (error) =>
  typeof error?.code === "string" && error.code.startsWith("store.")
    ? error.code
    : "store.failed";

const disabledResult = (received) => ({
  summary: {
    received,
    processed: 0,
    skipped: 0,
    failed: 0,
    suggestions: 0,
    persisted: 0,
    idempotent: 0,
    rejected: 0,
    classifierEnabled: false
  },
  diagnostics: {
    pipeline: {},
    storage: {}
  },
  storage: {
    status: "disabled",
    code: null
  }
});

export const createClassificationPersistenceService = ({
  pipeline = createClassificationPipeline(),
  store
} = {}) => {
  if (!store || typeof store.appendSuggestions !== "function") {
    throw new TypeError("Classification persistence requires a classifier store.");
  }

  return {
    processRecords: async (records = []) => {
      const input = Array.isArray(records) ? records : [];
      if (!pipeline.isEnabled()) {
        return disabledResult(input.length);
      }

      const classified = await pipeline.classifyRecords(input);
      const pipelineDiagnostics = [
        ...classified.diagnostics.skipped,
        ...classified.diagnostics.failures
      ];
      const base = {
        received: classified.summary.received,
        processed: classified.summary.processed,
        skipped: classified.summary.skipped,
        failed: classified.summary.failed,
        suggestions: classified.summary.suggestions,
        classifierEnabled: true
      };

      try {
        const persisted = await store.appendSuggestions(classified.suggestions);
        return {
          summary: {
            ...base,
            persisted: persisted.accepted.length,
            idempotent: persisted.idempotent.length,
            rejected: persisted.rejected.length
          },
          diagnostics: {
            pipeline: countCodes(pipelineDiagnostics),
            storage: countCodes(persisted.rejected)
          },
          storage: {
            status: "ready",
            code: null
          }
        };
      } catch (error) {
        return {
          summary: {
            ...base,
            persisted: 0,
            idempotent: 0,
            rejected: classified.suggestions.length
          },
          diagnostics: {
            pipeline: countCodes(pipelineDiagnostics),
            storage: {
              [storageFailureCode(error)]: 1
            }
          },
          storage: {
            status: "failed",
            code: storageFailureCode(error)
          }
        };
      }
    },
    clearCache: () => pipeline.clearCache(),
    isEnabled: () => pipeline.isEnabled(),
    setEnabled: (value) => pipeline.setEnabled(value)
  };
};
