import { classifyDeterministicDates } from "../../src/classification/deterministic-dates.js";
import {
  classifyDeterministicMessageSignals
} from "../../src/classification/deterministic-message-signals.js";
import {
  classifyDeterministicUrgency
} from "../../src/classification/deterministic-urgency.js";

export const classifyWithDeterministicCore = (message) => {
  const dates = classifyDeterministicDates(message);
  const messageSignals = classifyDeterministicMessageSignals(message);
  const urgency = classifyDeterministicUrgency(message);
  return {
    labels: {
      needsReply: messageSignals.suggestions.needsReply,
      hasDeadline: dates.suggestions.hasDeadline,
      calendarCandidate: dates.suggestions.calendarCandidate,
      urgent: urgency.suggestions.urgent,
      automated: messageSignals.suggestions.automated,
      topic: null
    },
    confidence: {
      needsReply: messageSignals.confidence.needsReply,
      hasDeadline: dates.confidence.hasDeadline,
      calendarCandidate: dates.confidence.calendarCandidate,
      urgent: urgency.confidence.urgent,
      automated: messageSignals.confidence.automated,
      topic: 0
    },
    evidence: {
      needsReply: messageSignals.evidence.needsReply,
      hasDeadline: dates.evidence.hasDeadline,
      calendarCandidate: dates.evidence.calendarCandidate,
      urgent: urgency.evidence.urgent,
      automated: messageSignals.evidence.automated,
      topic: []
    },
    abstained: [
      ...dates.abstained,
      ...messageSignals.abstained,
      ...urgency.abstained,
      "topic"
    ],
    values: dates.values,
    modelVersion: "nexus-deterministic-core/3"
  };
};
