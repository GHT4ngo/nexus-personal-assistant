const QUEUES = Object.freeze([
  Object.freeze({
    key: "pending",
    heading: "Suggestions to review",
    description: "Classifier suggestions awaiting your decision."
  }),
  Object.freeze({
    key: "abstained",
    heading: "Not enough information",
    description: "Items where the classifier chose not to guess."
  }),
  Object.freeze({
    key: "resolved",
    heading: "Reviewed suggestions",
    description: "Your recorded decisions, shown separately from suggestions."
  })
]);
const ACTIONS = Object.freeze([
  Object.freeze({ decision: "accept", label: "Accept suggestion", requiresValue: false }),
  Object.freeze({ decision: "correct", label: "Correct suggestion", requiresValue: true }),
  Object.freeze({ decision: "dismiss", label: "Dismiss suggestion", requiresValue: false }),
  Object.freeze({
    decision: "not-enough-information",
    label: "Not enough information",
    requiresValue: false
  })
]);
const ACTION_BY_DECISION = new Map(ACTIONS.map((action) => [
  action.decision,
  action
]));

const outcome = (status, code = null) => Object.freeze({ status, code });

const displayValue = (item) => item.suggestedValue
  ?? item.extractedValue
  ?? "No value suggested";

const actionsFor = (item) => item.status === "pending"
  ? ACTIONS
  : item.status === "abstained"
    ? ACTIONS.filter((action) => action.decision !== "accept")
    : [];

const presentItem = (item, itemId) => Object.freeze({
  itemId,
  suggestionType: item.suggestionType,
  value: displayValue(item),
  confidence: `${Math.round(item.confidence * 100)}% confidence`,
  evidence: item.evidenceAvailable
    ? "Supporting evidence is available"
    : "No supporting evidence is available",
  status: item.status,
  effectiveValue: item.effectiveValue,
  actions: Object.freeze(actionsFor(item).map((action) => Object.freeze({
    decision: action.decision,
    label: action.label,
    requiresValue: action.requiresValue
  })))
});

const presentView = (view) => {
  const commandTargets = new Map();
  let sequence = 0;
  const sections = QUEUES.map((section) => {
    const items = view.queues[section.key].map((item) => {
      sequence += 1;
      const itemId = `classifier-review-item-${sequence}`;
      commandTargets.set(itemId, Object.freeze({
        reviewKey: item.reviewKey,
        expectedStatus: item.status
      }));
      return presentItem(item, itemId);
    });
    return Object.freeze({
      key: section.key,
      heading: section.heading,
      description: section.description,
      count: items.length,
      items: Object.freeze(items)
    });
  });
  return {
    model: Object.freeze({
      heading: "Classifier review",
      description:
        "Suggestions are separate from your decisions and never become automatic actions.",
      summary: Object.freeze({ ...view.summary }),
      sections: Object.freeze(sections)
    }),
    commandTargets
  };
};

export const createClassifierReviewRenderer = ({
  entry,
  dom,
  generateCommandId = () => globalThis.crypto.randomUUID()
} = {}) => {
  if (!entry
    || typeof entry.readReviewView !== "function"
    || typeof entry.submitReview !== "function") {
    throw new TypeError("Review renderer requires a controlled review entry.");
  }
  if (!dom
    || typeof dom.render !== "function"
    || typeof dom.announce !== "function"
    || typeof dom.clear !== "function") {
    throw new TypeError("Review renderer requires a DOM adapter.");
  }
  if (typeof generateCommandId !== "function") {
    throw new TypeError("Review renderer requires a command ID generator.");
  }

  let state = "idle";
  let commandTargets = new Map();

  const refresh = async () => {
    if (state === "cleared") {
      return outcome("rejected", "renderer.unavailable");
    }
    state = "loading";
    let response;
    try {
      response = await entry.readReviewView();
    } catch {
      response = null;
    }
    if (state === "cleared") {
      return outcome("rejected", "renderer.unavailable");
    }
    if (response?.status !== "ready" || !response.view) {
      state = "failed";
      commandTargets = new Map();
      dom.clear();
      dom.announce("Classifier review is unavailable.", "error");
      return outcome("rejected", "renderer.view.unavailable");
    }
    const presented = presentView(response.view);
    commandTargets = presented.commandTargets;
    dom.render(presented.model);
    state = "ready";
    return outcome("ready");
  };

  const activate = async ({
    itemId,
    decision,
    correctedValue = null
  } = {}) => {
    if (state !== "ready") {
      return outcome("rejected", "renderer.unavailable");
    }
    const target = commandTargets.get(itemId);
    const action = ACTION_BY_DECISION.get(decision);
    if (!target || !action) {
      return outcome("rejected", "renderer.action.invalid");
    }
    if (decision === "accept" && target.expectedStatus === "abstained") {
      return outcome("rejected", "renderer.action.invalid");
    }
    const correction = decision === "correct"
      && typeof correctedValue === "string"
      ? correctedValue.trim()
      : correctedValue;
    if ((decision === "correct"
        && !["boolean", "string"].includes(typeof correction))
      || (decision === "correct"
        && typeof correction === "string"
        && correction.length === 0)
      || (decision !== "correct" && correctedValue !== null)) {
      return outcome("rejected", "renderer.correction.invalid");
    }

    state = "submitting";
    let commandId;
    try {
      commandId = generateCommandId();
    } catch {
      state = "ready";
      return outcome("rejected", "renderer.command.unavailable");
    }
    let submitted;
    try {
      submitted = await entry.submitReview({
        ...target,
        commandId,
        decision,
        ...(decision === "correct" ? { correctedValue: correction } : {})
      });
    } catch {
      submitted = null;
    }
    if (state === "cleared") {
      return outcome("rejected", "renderer.unavailable");
    }
    if (submitted?.status !== "ready"
      || submitted.result?.status !== "accepted") {
      state = "ready";
      dom.announce("The review decision was not saved. Refresh and try again.", "error");
      return outcome("rejected", "renderer.command.rejected");
    }
    dom.announce("Review decision saved.", "status");
    return await refresh();
  };

  const clear = () => {
    if (state === "cleared") {
      return;
    }
    state = "cleared";
    commandTargets = new Map();
    dom.clear();
  };

  return Object.freeze({
    refresh,
    activate,
    clear,
    status: () => state
  });
};
