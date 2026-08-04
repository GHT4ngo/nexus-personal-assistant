const newestDecision = (current, candidate) => {
  if (!current) {
    return candidate;
  }
  if (candidate.decidedAt !== current.decidedAt) {
    return candidate.decidedAt > current.decidedAt ? candidate : current;
  }
  return candidate.recordId > current.recordId ? candidate : current;
};

const statusFor = (suggestion, decision) => {
  if (!decision) {
    return suggestion.abstained ? "abstained" : "pending";
  }
  return {
    accept: "accepted",
    correct: "corrected",
    dismiss: "dismissed",
    "not-enough-information": "not-enough-information"
  }[decision.decision];
};

const effectiveValueFor = (suggestion, decision) => {
  if (!decision) {
    return null;
  }
  if (decision.decision === "accept") {
    return suggestion.suggestedValue;
  }
  if (decision.decision === "correct") {
    return decision.correctedValue;
  }
  return null;
};

export const projectClassifierReviews = (records = []) => {
  const suggestions = records.filter((record) =>
    record.recordType === "classifier-suggestion");
  const latestBySuggestion = new Map();

  records
    .filter((record) =>
      record.recordType === "review-decision"
      && record.reviewKind === "classifier-suggestion")
    .forEach((decision) => {
      latestBySuggestion.set(
        decision.subjectRecordId,
        newestDecision(latestBySuggestion.get(decision.subjectRecordId), decision)
      );
    });

  const items = suggestions
    .map((suggestion) => {
      const decision = latestBySuggestion.get(suggestion.recordId) || null;
      return {
        suggestion,
        latestDecision: decision,
        status: statusFor(suggestion, decision),
        effectiveValue: effectiveValueFor(suggestion, decision)
      };
    })
    .sort((left, right) =>
      left.suggestion.recordId.localeCompare(right.suggestion.recordId));

  const pending = items.filter((item) => item.status === "pending");
  const abstained = items.filter((item) => item.status === "abstained");
  const resolved = items.filter((item) =>
    !["pending", "abstained"].includes(item.status));

  return {
    items,
    queues: {
      pending,
      abstained,
      resolved
    },
    summary: {
      total: items.length,
      pending: pending.length,
      abstained: abstained.length,
      resolved: resolved.length
    }
  };
};
