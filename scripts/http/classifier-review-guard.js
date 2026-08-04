import {
  createHash,
  timingSafeEqual
} from "node:crypto";

const REVIEW_PATHS = new Set([
  "/api/classifier/reviews",
  "/api/classifier/reviews/commands"
]);
const TOKEN_HEADER = "x-nexus-review-token";

const header = (request, name) => {
  if (typeof request.headers?.get === "function") {
    return request.headers.get(name) || "";
  }
  return request.headers?.[name] || "";
};

const normalizeOrigin = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.origin === "null"
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const tokenDigest = (value) => createHash("sha256")
  .update(String(value))
  .digest();

const tokenMatches = (candidate, expected) =>
  timingSafeEqual(tokenDigest(candidate), tokenDigest(expected));

const deny = (sendJson, response, code) => {
  sendJson(response, 403, {
    status: "rejected",
    code
  });
};

export const createClassifierReviewRequestGuard = ({
  handler,
  allowedOrigins,
  commandToken,
  sendJson
} = {}) => {
  if (typeof handler !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Classifier review guard requires HTTP adapters.");
  }
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    throw new TypeError("Classifier review guard requires allowed origins.");
  }
  const normalizedOrigins = allowedOrigins.map(normalizeOrigin);
  if (normalizedOrigins.some((origin) => origin === null)
    || new Set(normalizedOrigins).size !== normalizedOrigins.length) {
    throw new TypeError("Classifier review guard requires unique valid origins.");
  }
  if (typeof commandToken !== "string"
    || Buffer.byteLength(commandToken, "utf8") < 32) {
    throw new TypeError(
      "Classifier review guard requires a command token of at least 32 bytes."
    );
  }
  const originSet = new Set(normalizedOrigins);

  return async (request, url, response) => {
    if (!REVIEW_PATHS.has(url.pathname)) {
      return handler(request, url, response);
    }

    const requestOrigin = normalizeOrigin(header(request, "origin"));
    if (!requestOrigin || !originSet.has(requestOrigin)) {
      deny(sendJson, response, "request.origin.denied");
      return true;
    }

    if (!tokenMatches(header(request, TOKEN_HEADER), commandToken)) {
      deny(sendJson, response, "request.token.denied");
      return true;
    }

    return handler(request, url, response);
  };
};

export const CLASSIFIER_REVIEW_TOKEN_HEADER = TOKEN_HEADER;
