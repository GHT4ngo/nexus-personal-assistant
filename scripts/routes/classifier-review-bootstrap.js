const PATH = "/api/classifier/reviews/bootstrap";
const MAX_BYTES = 256;

const header = (request, name) => request.headers?.[name]
  || request.headers?.get?.(name)
  || "";

const reply = (sendJson, response, status, code) =>
  sendJson(response, status, { status: "rejected", code });

export const createClassifierReviewBootstrapRouteHandler = ({
  service,
  allowedOrigins,
  readRequestBody,
  sendJson,
  applyCors,
  sendEmpty
} = {}) => {
  if (!service || typeof service.redeem !== "function"
    || !Array.isArray(allowedOrigins)
    || typeof readRequestBody !== "function"
    || typeof sendJson !== "function"
    || typeof applyCors !== "function"
    || typeof sendEmpty !== "function") {
    throw new TypeError("Review bootstrap route requires explicit dependencies.");
  }
  const origins = new Set(allowedOrigins.map((value) => new URL(value).origin));

  return async (request, url, response) => {
    if (url.pathname !== PATH) {
      return false;
    }
    const origin = header(request, "origin");
    if (!origins.has(origin)) {
      reply(sendJson, response, 403, "bootstrap.denied");
      return true;
    }
    applyCors(response, origin);
    if (request.method === "OPTIONS") {
      if (header(request, "access-control-request-method") !== "POST"
        || header(request, "access-control-request-headers").toLowerCase()
          .split(",").map((value) => value.trim()).filter(Boolean)
          .some((value) => value !== "content-type")) {
        reply(sendJson, response, 403, "bootstrap.denied");
        return true;
      }
      sendEmpty(response, 204);
      return true;
    }
    if (request.method !== "POST"
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        header(request, "content-type").trim()
      )) {
      reply(sendJson, response, 400, "bootstrap.denied");
      return true;
    }
    try {
      const source = await readRequestBody(request, MAX_BYTES);
      if (Buffer.byteLength(source, "utf8") > MAX_BYTES) {
        reply(sendJson, response, 403, "bootstrap.denied");
        return true;
      }
      const body = JSON.parse(source);
      if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).length !== 1
        || typeof body.bootstrapCode !== "string") {
        reply(sendJson, response, 403, "bootstrap.denied");
        return true;
      }
      const result = service.redeem({
        origin,
        bootstrapCode: body.bootstrapCode
      });
      sendJson(response, result.status === "ready" ? 200 : 403, result);
    } catch {
      reply(sendJson, response, 403, "bootstrap.denied");
    }
    return true;
  };
};

export const CLASSIFIER_REVIEW_BOOTSTRAP_MAX_BYTES = MAX_BYTES;
