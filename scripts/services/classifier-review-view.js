import { createHash } from "node:crypto";

import {
  projectClassifierReviews
} from "../../src/classification/review-projection.js";

const opaqueKey = (kind, value) => createHash("sha256")
  .update(`nexus-classifier-review-view/1:${kind}:${value}`)
  .digest("hex");

const emptyQueues = () => ({
  pending: [],
  abstained: [],
  resolved: []
});

const failureCode = (error) =>
  typeof error?.code === "string" && error.code.startsWith("store.")
    ? error.code
    : "store.failed";

const toViewItem = ({ suggestion, status, effectiveValue }) => ({
  reviewKey: opaqueKey("suggestion", suggestion.recordId),
  subjectKey: opaqueKey("subject", suggestion.subjectRecordId),
  suggestionType: suggestion.suggestionType,
  suggestedValue: suggestion.suggestedValue,
  extractedValue: suggestion.extractedValue,
  confidence: suggestion.confidence,
  abstained: suggestion.abstained,
  evidenceAvailable: suggestion.evidence.length > 0,
  status,
  effectiveValue
});

export const createClassifierReviewViewService = ({ store } = {}) => {
  if (!store || typeof store.read !== "function") {
    throw new TypeError("Classifier review view requires a classifier store.");
  }

  return {
    readReviewView: async () => {
      try {
        const stored = await store.read();
        const projected = projectClassifierReviews([
          ...stored.suggestions,
          ...stored.reviews
        ]);
        return {
          summary: { ...projected.summary },
          queues: {
            pending: projected.queues.pending.map(toViewItem),
            abstained: projected.queues.abstained.map(toViewItem),
            resolved: projected.queues.resolved.map(toViewItem)
          },
          storage: {
            status: "ready",
            code: null
          }
        };
      } catch (error) {
        const code = failureCode(error);
        return {
          summary: {
            total: 0,
            pending: 0,
            abstained: 0,
            resolved: 0
          },
          queues: emptyQueues(),
          storage: {
            status: "failed",
            code
          }
        };
      }
    }
  };
};
