import { createHash } from "node:crypto";

import {
  classifyDeterministicCore,
  DETERMINISTIC_CORE_VERSION
} from "./deterministic-core.js";

export const CLASSIFIER_LABELS = [
  "needsReply",
  "hasDeadline",
  "calendarCandidate",
  "urgent",
  "automated",
  "topic"
];

export const selectClassifierInput = (record = {}) => ({
  title: String(record.title || record.subject || ""),
  text: String(record.text || record.body || ""),
  from: String(record.from || ""),
  receivedAt: String(record.receivedAt || ""),
  hasListUnsubscribe: Boolean(
    record.hasListUnsubscribe || record.headers?.listUnsubscribe
  )
});

export const classifierContentHash = (record) =>
  createHash("sha256")
    .update(JSON.stringify(selectClassifierInput(record)))
    .digest("hex");

const disabledResult = (modelVersion) => ({
  suggestions: Object.fromEntries(CLASSIFIER_LABELS.map((label) => [label, null])),
  confidence: Object.fromEntries(CLASSIFIER_LABELS.map((label) => [label, 0])),
  evidence: Object.fromEntries(CLASSIFIER_LABELS.map((label) => [label, []])),
  abstained: [...CLASSIFIER_LABELS],
  values: {
    hasDeadline: null,
    calendarCandidate: null
  },
  modelVersion,
  classifierEnabled: false,
  cache: {
    hit: false,
    key: null
  }
});

const clone = (value) => structuredClone(value);

export const createClassifierAdapter = ({
  classifier = classifyDeterministicCore,
  modelVersion = DETERMINISTIC_CORE_VERSION,
  enabled = false,
  cache = new Map()
} = {}) => {
  let isEnabled = Boolean(enabled);

  return {
    classify: async (record) => {
      if (!isEnabled) {
        return disabledResult(modelVersion);
      }

      const input = selectClassifierInput(record);
      const hash = classifierContentHash(input);
      const key = `${modelVersion}:${hash}`;
      if (cache.has(key)) {
        const cached = clone(cache.get(key));
        return {
          ...cached,
          classifierEnabled: true,
          cache: { hit: true, key }
        };
      }

      const result = await classifier(input);
      if (result?.modelVersion !== modelVersion) {
        throw new Error(
          `Classifier version mismatch: expected "${modelVersion}", received "${result?.modelVersion}".`
        );
      }
      const stored = clone(result);
      cache.set(key, stored);
      return {
        ...clone(stored),
        classifierEnabled: true,
        cache: { hit: false, key }
      };
    },
    clearCache: () => cache.clear(),
    isEnabled: () => isEnabled,
    setEnabled: (value) => {
      isEnabled = Boolean(value);
    }
  };
};
