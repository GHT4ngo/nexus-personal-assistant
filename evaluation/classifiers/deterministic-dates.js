import { classifyDeterministicDates } from "../../src/classification/deterministic-dates.js";

export const classifyWithDeterministicDates = (message) => {
  const result = classifyDeterministicDates(message);
  return {
    labels: {
      needsReply: null,
      hasDeadline: result.suggestions.hasDeadline,
      calendarCandidate: result.suggestions.calendarCandidate,
      urgent: null,
      automated: null,
      topic: null
    },
    confidence: {
      needsReply: 0,
      hasDeadline: result.confidence.hasDeadline,
      calendarCandidate: result.confidence.calendarCandidate,
      urgent: 0,
      automated: 0,
      topic: 0
    },
    evidence: {
      needsReply: [],
      hasDeadline: result.evidence.hasDeadline,
      calendarCandidate: result.evidence.calendarCandidate,
      urgent: [],
      automated: [],
      topic: []
    },
    abstained: [
      "needsReply",
      ...result.abstained,
      "urgent",
      "automated",
      "topic"
    ],
    values: result.values,
    modelVersion: result.modelVersion
  };
};
