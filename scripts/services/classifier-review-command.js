import {
  projectClassifierReviews
} from "../../src/classification/review-projection.js";
import {
  createClassifierReviewDecisionRecord
} from "../../src/domain/records.js";
import {
  classifierReviewKeyFor
} from "./classifier-review-view.js";

const REVIEW_KEY = /^[a-f0-9]{64}$/;
const COMMAND_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECISIONS = new Set([
  "accept",
  "correct",
  "dismiss",
  "not-enough-information"
]);
const STATUSES = new Set([
  "pending",
  "abstained",
  "accepted",
  "corrected",
  "dismissed",
  "not-enough-information"
]);

const result = (status, code = null, idempotent = false) => ({
  status,
  code,
  idempotent
});

const storageCode = (error) =>
  typeof error?.code === "string" && error.code.startsWith("store.")
    ? error.code
    : "store.failed";

const sameCommand = (record, suggestion, decision, correctedValue) =>
  record.subjectRecordId === suggestion.recordId
    && record.decision === decision
    && record.correctedValue === correctedValue
    && record.reviewKind === "classifier-suggestion";

export const createClassifierReviewCommandService = ({
  store,
  now = () => new Date()
} = {}) => {
  if (!store
    || typeof store.read !== "function"
    || typeof store.appendReviews !== "function") {
    throw new TypeError("Classifier review command requires a classifier store.");
  }

  return {
    submitReview: async ({
      reviewKey,
      expectedStatus,
      commandId,
      decision,
      correctedValue = null
    } = {}) => {
      if (typeof reviewKey !== "string" || !REVIEW_KEY.test(reviewKey)) {
        return result("rejected", "review.key.invalid");
      }
      if (typeof commandId !== "string" || !COMMAND_ID.test(commandId)) {
        return result("rejected", "review.command.invalid");
      }
      if (!DECISIONS.has(decision)) {
        return result("rejected", "review.decision.invalid");
      }
      if (!STATUSES.has(expectedStatus)) {
        return result("rejected", "review.status.invalid");
      }
      const invalidCorrection =
        (decision === "correct" && correctedValue === null)
        || (decision !== "correct" && correctedValue !== null)
        || (
          correctedValue !== null
          && !["boolean", "string"].includes(typeof correctedValue)
        );
      if (invalidCorrection) {
        return result("rejected", "review.value.invalid");
      }

      let stored;
      try {
        stored = await store.read();
      } catch (error) {
        return result("failed", storageCode(error));
      }

      const suggestion = stored.suggestions.find((record) =>
        classifierReviewKeyFor(record.recordId) === reviewKey);
      if (!suggestion) {
        return result("rejected", "review.key.unknown");
      }

      const sourceId = `classifier-review-${commandId.toLowerCase()}`;
      const existing = stored.reviews.find((record) =>
        record.source === "local" && record.sourceId === sourceId);
      if (existing) {
        return sameCommand(existing, suggestion, decision, correctedValue)
          ? result("accepted", null, true)
          : result("rejected", "review.command.conflict");
      }

      const projected = projectClassifierReviews([
        ...stored.suggestions,
        ...stored.reviews
      ]);
      const current = projected.items.find((item) =>
        item.suggestion.recordId === suggestion.recordId);
      if (!current || current.status !== expectedStatus) {
        return result("rejected", "review.stale");
      }

      let review;
      try {
        const decidedAt = now();
        review = createClassifierReviewDecisionRecord({
          sourceId,
          title: `Classifier review: ${decision}`,
          subjectRecordId: suggestion.recordId,
          decision,
          correctedValue,
          decidedAt,
          normalizedAt: decidedAt
        });
      } catch {
        return result("rejected", "review.value.invalid");
      }

      try {
        const appended = await store.appendReviews([review]);
        if (appended.accepted.length === 1) {
          return result("accepted");
        }
        if (appended.idempotent.length === 1) {
          return result("accepted", null, true);
        }
        return result("rejected", "review.write-rejected");
      } catch (error) {
        return result("failed", storageCode(error));
      }
    }
  };
};
