import { classifyDeterministicDates } from "./deterministic-dates.js";
import {
  classifyDeterministicMessageSignals
} from "./deterministic-message-signals.js";
import { classifyDeterministicTopic } from "./deterministic-topic.js";
import { classifyDeterministicUrgency } from "./deterministic-urgency.js";

export const DETERMINISTIC_CORE_VERSION = "nexus-deterministic-core/4";

export const classifyDeterministicCore = (record) => {
  const dates = classifyDeterministicDates(record);
  const messageSignals = classifyDeterministicMessageSignals(record);
  const urgency = classifyDeterministicUrgency(record);
  const topic = classifyDeterministicTopic(record);

  return {
    suggestions: {
      needsReply: messageSignals.suggestions.needsReply,
      hasDeadline: dates.suggestions.hasDeadline,
      calendarCandidate: dates.suggestions.calendarCandidate,
      urgent: urgency.suggestions.urgent,
      automated: messageSignals.suggestions.automated,
      topic: topic.suggestions.topic
    },
    confidence: {
      needsReply: messageSignals.confidence.needsReply,
      hasDeadline: dates.confidence.hasDeadline,
      calendarCandidate: dates.confidence.calendarCandidate,
      urgent: urgency.confidence.urgent,
      automated: messageSignals.confidence.automated,
      topic: topic.confidence.topic
    },
    evidence: {
      needsReply: messageSignals.evidence.needsReply,
      hasDeadline: dates.evidence.hasDeadline,
      calendarCandidate: dates.evidence.calendarCandidate,
      urgent: urgency.evidence.urgent,
      automated: messageSignals.evidence.automated,
      topic: topic.evidence.topic
    },
    abstained: [
      ...dates.abstained,
      ...messageSignals.abstained,
      ...urgency.abstained,
      ...topic.abstained
    ],
    values: dates.values,
    modelVersion: DETERMINISTIC_CORE_VERSION
  };
};
