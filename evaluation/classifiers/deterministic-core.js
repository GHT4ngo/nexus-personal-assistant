import {
  classifyDeterministicCore
} from "../../src/classification/deterministic-core.js";

export const classifyWithDeterministicCore = (message) => {
  const result = classifyDeterministicCore(message);
  return {
    labels: result.suggestions,
    confidence: result.confidence,
    evidence: result.evidence,
    abstained: result.abstained,
    values: result.values,
    modelVersion: result.modelVersion
  };
};
