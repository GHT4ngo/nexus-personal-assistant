const HANDOFF_ID = "nexus-classifier-review-bootstrap";
const BOOTSTRAP_PATH = "/api/classifier/reviews/bootstrap";
const REVIEW_PATH = "/api/classifier/reviews";
const COMMAND_PATH = "/api/classifier/reviews/commands";
const TOKEN_HEADER = "X-Nexus-Review-Token";

const result = (status, code = null) => Object.freeze({ status, code });

const parseHandoff = (text, now) => {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!payload
    || Array.isArray(payload)
    || typeof payload !== "object"
    || Object.keys(payload).sort().join(",")
      !== "bootstrapCode,bootstrapPath,expiresAt"
    || typeof payload.bootstrapCode !== "string"
    || new TextEncoder().encode(payload.bootstrapCode).byteLength < 32
    || payload.bootstrapPath !== BOOTSTRAP_PATH
    || !Number.isFinite(payload.expiresAt)
    || payload.expiresAt <= now()) {
    return null;
  }
  return payload;
};

const parseToken = async (response) => {
  if (!response?.ok) {
    return null;
  }
  let payload;
  try {
    const text = await response.text();
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!payload
    || Array.isArray(payload)
    || typeof payload !== "object"
    || Object.keys(payload).sort().join(",") !== "code,status,token"
    || payload.status !== "ready"
    || payload.code !== null
    || typeof payload.token !== "string"
    || new TextEncoder().encode(payload.token).byteLength < 32) {
    return null;
  }
  return payload.token;
};

export const createClassifierReviewBootstrapClient = ({
  document,
  fetch,
  now = () => Date.now()
} = {}) => {
  if (!document || typeof document.getElementById !== "function") {
    throw new TypeError("Review bootstrap client requires a document adapter.");
  }
  if (typeof fetch !== "function") {
    throw new TypeError("Review bootstrap client requires a fetch adapter.");
  }
  if (typeof now !== "function") {
    throw new TypeError("Review bootstrap client requires a clock.");
  }

  let state = "idle";
  let reviewToken = null;

  const initialize = async () => {
    if (state !== "idle") {
      return result("rejected", "client.bootstrap.unavailable");
    }
    state = "initializing";
    const element = document.getElementById(HANDOFF_ID);
    if (!element || typeof element.remove !== "function") {
      state = "failed";
      return result("rejected", "client.bootstrap.unavailable");
    }

    const handoffText = String(element.textContent || "");
    element.textContent = "";
    element.remove();
    const handoff = parseHandoff(handoffText, now);
    if (!handoff) {
      state = "failed";
      return result("rejected", "client.bootstrap.denied");
    }

    let response;
    try {
      response = await fetch(handoff.bootstrapPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapCode: handoff.bootstrapCode }),
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "no-referrer"
      });
    } catch {
      state = "failed";
      return result("rejected", "client.bootstrap.failed");
    }
    const token = await parseToken(response);
    if (!token) {
      state = "failed";
      return result("rejected", "client.bootstrap.denied");
    }

    reviewToken = token;
    state = "ready";
    return result("ready");
  };

  const reviewRequest = async (path, options = {}) => {
    if (state !== "ready" || !reviewToken) {
      throw new TypeError("Classifier review session is not ready.");
    }
    const expectedMethod = path === REVIEW_PATH
      ? "GET"
      : path === COMMAND_PATH
        ? "POST"
        : null;
    const method = String(options.method || expectedMethod || "").toUpperCase();
    if (!expectedMethod || method !== expectedMethod) {
      throw new TypeError("Classifier review request is outside the allowed boundary.");
    }

    const headers = new Headers(options.headers);
    headers.set(TOKEN_HEADER, reviewToken);
    return await fetch(path, {
      ...options,
      method,
      headers,
      cache: "no-store",
      credentials: "same-origin",
      referrerPolicy: "no-referrer"
    });
  };

  return Object.freeze({
    initialize,
    reviewRequest,
    clear: () => {
      reviewToken = null;
      state = "cleared";
    },
    status: () => state
  });
};
