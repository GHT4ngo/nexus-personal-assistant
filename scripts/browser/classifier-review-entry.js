import {
  createClassifierReviewBootstrapClient
} from "./classifier-review-bootstrap-client.js";
import {
  createClassifierReviewRuntime
} from "./classifier-review-runtime.js";

const outcome = (status, code = null) => Object.freeze({ status, code });

export const createClassifierReviewEntry = ({
  createClient = createClassifierReviewBootstrapClient,
  createRuntime = createClassifierReviewRuntime
} = {}) => {
  if (typeof createClient !== "function" || typeof createRuntime !== "function") {
    throw new TypeError("Review entry requires client and runtime factories.");
  }

  let runtime = null;
  let startPromise = null;
  let terminalState = null;

  const status = () => runtime
    ? runtime.status()
    : Object.freeze({
      status: terminalState || "idle",
      code: terminalState === "failed" ? "entry.start.failed" : null
    });

  const start = ({
    document,
    fetch,
    lifecycleTarget,
    now
  } = {}) => {
    if (terminalState === "cleared") {
      return Promise.resolve(outcome("rejected", "entry.start.unavailable"));
    }
    if (startPromise) {
      return startPromise.then((started) =>
        status().status === "ready"
          ? started
          : outcome("rejected", "entry.start.unavailable"));
    }

    startPromise = (async () => {
      try {
        const client = createClient({ document, fetch, now });
        runtime = createRuntime({ client, lifecycleTarget });
        const started = await runtime.initialize();
        if (terminalState === "cleared") {
          return outcome("rejected", "entry.start.unavailable");
        }
        if (started.status !== "ready") {
          terminalState = runtime.status().status === "cleared"
            ? "cleared"
            : "failed";
          return outcome("rejected", started.code || "entry.start.failed");
        }
        return outcome("ready");
      } catch {
        runtime?.clear?.();
        terminalState = "failed";
        return outcome("rejected", "entry.start.failed");
      }
    })();
    return startPromise;
  };

  const readReviewView = async () => runtime && status().status === "ready"
    ? runtime.readReviewView()
    : Object.freeze({
      status: "rejected",
      code: "entry.session.unavailable",
      view: null
    });

  const submitReview = async (command) => runtime && status().status === "ready"
    ? runtime.submitReview(command)
    : Object.freeze({
      status: "rejected",
      code: "entry.session.unavailable",
      result: null
    });

  const clear = () => {
    if (terminalState === "cleared") {
      return;
    }
    runtime?.clear();
    terminalState = "cleared";
  };

  return Object.freeze({
    start,
    readReviewView,
    submitReview,
    status,
    clear
  });
};

const moduleEntry = createClassifierReviewEntry();

export const startClassifierReviewEntry = ({
  document = globalThis.document,
  fetch = globalThis.fetch?.bind(globalThis),
  lifecycleTarget = globalThis,
  now
} = {}) => moduleEntry.start({
  document,
  fetch,
  lifecycleTarget,
  now
});

export const readClassifierReviewView = () => moduleEntry.readReviewView();
export const submitClassifierReview = (command) =>
  moduleEntry.submitReview(command);
export const classifierReviewEntryStatus = () => moduleEntry.status();
export const clearClassifierReviewEntry = () => moduleEntry.clear();
