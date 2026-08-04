import { classifyDeterministicDates } from "../../src/classification/deterministic-dates.js";
import {
  classifyDeterministicMessageSignals
} from "../../src/classification/deterministic-message-signals.js";

export const classifyWithDeterministicCore = (message) => {
  const dates = classifyDeterministicDates(message);
  const messageSignals = classifyDeterministicMessageSignals(message);
  return {
    labels: {
      needsReply: messageSignals.suggestions.needsReply,
      hasDeadline: dates.suggestions.hasDeadline,
      calendarCandidate: dates.suggestions.calendarCandidate,
      urgent: null,
      automated: messageSignals.suggestions.automated,
      topic: null
    },
    confidence: {
      needsReply: messageSignals.confidence.needsReply,
      hasDeadline: dates.confidence.hasDeadline,
      calendarCandidate: dates.confidence.calendarCandidate,
      urgent: 0,
      automated: messageSignals.confidence.automated,
      topic: 0
    },
    evidence: {
      needsReply: messageSignals.evidence.needsReply,
      hasDeadline: dates.evidence.hasDeadline,
      calendarCandidate: dates.evidence.calendarCandidate,
      urgent: [],
      automated: messageSignals.evidence.automated,
      topic: []
    },
    abstained: [
      ...dates.abstained,
      ...messageSignals.abstained,
      "urgent",
      "topic"
    ],
    values: dates.values,
    modelVersion: "nexus-deterministic-core/1"
  };
};
