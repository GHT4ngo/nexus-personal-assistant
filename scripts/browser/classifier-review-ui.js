import {
  clearClassifierReviewEntry,
  readClassifierReviewView,
  startClassifierReviewEntry,
  submitClassifierReview
} from "./classifier-review-entry.js";
import {
  createClassifierReviewDomAdapter
} from "./classifier-review-dom.js";
import {
  createClassifierReviewRenderer
} from "./classifier-review-renderer.js";

const defaultEntry = Object.freeze({
  start: startClassifierReviewEntry,
  readReviewView: readClassifierReviewView,
  submitReview: submitClassifierReview,
  clear: clearClassifierReviewEntry
});
const outcome = (status, code = null) => Object.freeze({ status, code });

export const createClassifierReviewUi = ({
  document,
  root,
  entry = defaultEntry,
  createDom = createClassifierReviewDomAdapter,
  createRenderer = createClassifierReviewRenderer,
  generateCommandId
} = {}) => {
  if (!document || typeof document.createElement !== "function") {
    throw new TypeError("Review UI requires a document.");
  }
  if (!root
    || typeof root.replaceChildren !== "function"
    || typeof root.addEventListener !== "function"
    || typeof root.removeEventListener !== "function") {
    throw new TypeError("Review UI requires an explicit root element.");
  }
  if (!entry
    || typeof entry.start !== "function"
    || typeof entry.readReviewView !== "function"
    || typeof entry.submitReview !== "function"
    || typeof entry.clear !== "function") {
    throw new TypeError("Review UI requires a controlled entrypoint.");
  }
  if (typeof createDom !== "function" || typeof createRenderer !== "function") {
    throw new TypeError("Review UI requires DOM and renderer factories.");
  }
  if (generateCommandId !== undefined && typeof generateCommandId !== "function") {
    throw new TypeError("Review UI requires a valid command ID generator.");
  }

  let state = "idle";
  let startPromise = null;
  let renderer = null;
  const dom = createDom({
    document,
    root,
    onAction: (action) => state === "ready" && renderer
      ? renderer.activate(action)
      : outcome("rejected", "ui.action.unavailable")
  });
  renderer = createRenderer({
    entry: {
      readReviewView: (...args) => entry.readReviewView(...args),
      submitReview: (...args) => entry.submitReview(...args)
    },
    dom,
    ...(generateCommandId ? { generateCommandId } : {})
  });
  if (!dom
    || typeof dom.clear !== "function"
    || !renderer
    || typeof renderer.refresh !== "function"
    || typeof renderer.activate !== "function"
    || typeof renderer.clear !== "function") {
    throw new TypeError("Review UI factories returned invalid adapters.");
  }

  const teardown = () => {
    renderer.clear();
    dom.clear();
    entry.clear();
  };

  const start = (options = {}) => {
    if (state === "cleared" || state === "failed") {
      return Promise.resolve(outcome("rejected", "ui.start.unavailable"));
    }
    if (startPromise) {
      return startPromise.then((started) =>
        state === "ready"
          ? started
          : outcome("rejected", "ui.start.unavailable"));
    }
    state = "starting";
    startPromise = (async () => {
      let started;
      try {
        started = await entry.start(options);
      } catch {
        started = null;
      }
      if (state === "cleared") {
        return outcome("rejected", "ui.start.unavailable");
      }
      if (started?.status !== "ready") {
        state = "failed";
        teardown();
        return outcome("rejected", "ui.entry.unavailable");
      }

      let refreshed;
      try {
        refreshed = await renderer.refresh();
      } catch {
        refreshed = null;
      }
      if (state === "cleared") {
        return outcome("rejected", "ui.start.unavailable");
      }
      if (refreshed?.status !== "ready") {
        state = "failed";
        teardown();
        return outcome("rejected", "ui.view.unavailable");
      }
      state = "ready";
      return outcome("ready");
    })();
    return startPromise;
  };

  const clear = () => {
    if (state === "cleared") {
      return;
    }
    state = "cleared";
    teardown();
  };

  return Object.freeze({
    start,
    clear,
    status: () => Object.freeze({
      status: state,
      code: state === "failed" ? "ui.start.failed" : null
    })
  });
};
