import {
  createClassifierSuggestionRecord
} from "../domain/records.js";
import { CLASSIFIER_LABELS } from "./adapter.js";

const sourceIdFor = (modelVersion, contentHash, label) => {
  const version = modelVersion.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${version}-${contentHash}-${label}`;
};

export const createClassifierSuggestionRecords = ({
  classification,
  subjectRecordId,
  observedAt,
  normalizedAt
}) => {
  if (!classification?.classifierEnabled || !classification?.cache?.key) {
    return [];
  }
  const contentHash = classification.cache.key.slice(
    classification.cache.key.lastIndexOf(":") + 1
  );

  return CLASSIFIER_LABELS.map((label) => {
    const abstained = classification.abstained.includes(label);
    return createClassifierSuggestionRecord({
      sourceId: sourceIdFor(classification.modelVersion, contentHash, label),
      title: `Classifier suggestion: ${label}`,
      subjectRecordId,
      suggestionType: label,
      suggestedValue: abstained ? null : classification.suggestions[label],
      extractedValue: classification.values?.[label] ?? null,
      confidence: classification.confidence[label],
      evidence: classification.evidence[label],
      abstained,
      modelVersion: classification.modelVersion,
      contentHash,
      observedAt,
      normalizedAt
    });
  });
};
