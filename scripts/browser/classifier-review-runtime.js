const VIEW_PATH = "/api/classifier/reviews";
const COMMAND_PATH = "/api/classifier/reviews/commands";
const MAX_VIEW_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 8 * 1024;
const COMMAND_FIELDS = new Set([
  "reviewKey",
  "expectedStatus",
  "commandId",
  "decision",
  "correctedValue"
]);
const VIEW_ITEM_FIELDS = new Set([
  "reviewKey",
  "subjectKey",
  "suggestionType",
  "suggestedValue",
  "extractedValue",
  "confidence",
  "abstained",
  "evidenceAvailable",
  "status",
  "effectiveValue"
]);
const SAFE_BOOTSTRAP_CODES = new Set([
  "client.bootstrap.unavailable",
  "client.bootstrap.denied",
  "client.bootstrap.failed"
]);

const outcome = (status, code = null, data = {}) =>
  Object.freeze({ status, code, ...data });

const readBoundedJson = async (response, maxBytes) => {
  const contentType = response?.headers?.get?.("content-type") || "";
  const contentLength = Number(response?.headers?.get?.("content-length"));
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim())
    || (Number.isFinite(contentLength) && contentLength > maxBytes)) {
    return null;
  }
  try {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return null;
    }
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
};

const validView = (value) =>
  value
  && Object.keys(value).sort().join(",") === "queues,storage,summary"
  && value.summary
  && Object.keys(value.summary).sort().join(",")
    === "abstained,pending,resolved,total"
  && Object.values(value.summary).every((count) =>
    Number.isSafeInteger(count) && count >= 0)
  && value.queues
  && Object.keys(value.queues).sort().join(",") === "abstained,pending,resolved"
  && Object.values(value.queues).every(Array.isArray)
  && Object.values(value.queues).flat().every((item) =>
    item
    && typeof item === "object"
    && !Array.isArray(item)
    && Object.keys(item).every((field) => VIEW_ITEM_FIELDS.has(field))
    && ["reviewKey", "subjectKey", "suggestionType", "confidence", "abstained",
      "evidenceAvailable", "status", "effectiveValue"]
      .every((field) => Object.hasOwn(item, field)))
  && value.storage
  && Object.keys(value.storage).sort().join(",") === "code,status"
  && value.storage.status === "ready"
  && value.storage.code === null;

const validCommand = (command) =>
  command
  && typeof command === "object"
  && !Array.isArray(command)
  && Object.keys(command).every((field) => COMMAND_FIELDS.has(field))
  && ["reviewKey", "expectedStatus", "commandId", "decision"]
    .every((field) =>
      Object.hasOwn(command, field) && typeof command[field] === "string")
  && (!Object.hasOwn(command, "correctedValue")
    || ["boolean", "string"].includes(typeof command.correctedValue)
    || command.correctedValue === null);

const validCommandResult = (value) =>
  value
  && ["accepted", "rejected", "failed"].includes(value.status)
  && (value.code === null || typeof value.code === "string")
  && Object.keys(value).every((field) =>
    ["status", "code", "idempotent"].includes(field));

export const createClassifierReviewRuntime = ({
  client,
  lifecycleTarget
} = {}) => {
  if (!client
    || typeof client.initialize !== "function"
    || typeof client.reviewRequest !== "function"
    || typeof client.clear !== "function") {
    throw new TypeError("Review runtime requires a private bootstrap client.");
  }
  if (!lifecycleTarget
    || typeof lifecycleTarget.addEventListener !== "function"
    || typeof lifecycleTarget.removeEventListener !== "function") {
    throw new TypeError("Review runtime requires a lifecycle target.");
  }

  let state = "idle";
  let lastCode = null;
  let listenersAttached = true;

  const detach = () => {
    if (!listenersAttached) {
      return;
    }
    lifecycleTarget.removeEventListener("pagehide", clear);
    lifecycleTarget.removeEventListener("beforeunload", clear);
    listenersAttached = false;
  };
  const clear = () => {
    if (state === "cleared") {
      return;
    }
    client.clear();
    state = "cleared";
    lastCode = null;
    detach();
  };
  lifecycleTarget.addEventListener("pagehide", clear);
  lifecycleTarget.addEventListener("beforeunload", clear);

  const initialize = async () => {
    if (state !== "idle") {
      return outcome("rejected", "runtime.bootstrap.unavailable");
    }
    state = "initializing";
    let initialized;
    try {
      initialized = await client.initialize();
    } catch {
      initialized = null;
    }
    if (initialized?.status !== "ready") {
      state = "failed";
      lastCode = SAFE_BOOTSTRAP_CODES.has(initialized?.code)
        ? initialized.code
        : "runtime.bootstrap.denied";
      client.clear();
      detach();
      return outcome("rejected", lastCode);
    }
    state = "ready";
    lastCode = null;
    return outcome("ready");
  };

  const readReviewView = async () => {
    if (state !== "ready") {
      return outcome("rejected", "runtime.session.unavailable", { view: null });
    }
    try {
      const response = await client.reviewRequest(VIEW_PATH);
      const view = await readBoundedJson(response, MAX_VIEW_BYTES);
      if (!response.ok || !validView(view)) {
        return outcome("rejected", "runtime.view.denied", { view: null });
      }
      return outcome("ready", null, { view });
    } catch {
      return outcome("rejected", "runtime.view.failed", { view: null });
    }
  };

  const submitReview = async (command) => {
    if (state !== "ready") {
      return outcome("rejected", "runtime.session.unavailable", { result: null });
    }
    if (!validCommand(command)) {
      return outcome("rejected", "runtime.command.invalid", { result: null });
    }
    try {
      const response = await client.reviewRequest(COMMAND_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command)
      });
      const result = await readBoundedJson(response, MAX_RESULT_BYTES);
      if (!validCommandResult(result)) {
        return outcome("rejected", "runtime.command.denied", { result: null });
      }
      return outcome(
        response.ok ? "ready" : "rejected",
        result.code,
        { result }
      );
    } catch {
      return outcome("rejected", "runtime.command.failed", { result: null });
    }
  };

  return Object.freeze({
    initialize,
    readReviewView,
    submitReview,
    status: () => Object.freeze({ status: state, code: lastCode }),
    clear
  });
};

export const CLASSIFIER_REVIEW_RUNTIME_MAX_VIEW_BYTES = MAX_VIEW_BYTES;
export const CLASSIFIER_REVIEW_RUNTIME_MAX_RESULT_BYTES = MAX_RESULT_BYTES;
