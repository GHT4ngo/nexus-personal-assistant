const VIEW_PATH = "/api/classifier/reviews";
const COMMAND_PATH = "/api/classifier/reviews/commands";
const MAX_COMMAND_BYTES = 4 * 1024;
const COMMAND_FIELDS = new Set([
  "reviewKey",
  "expectedStatus",
  "commandId",
  "decision",
  "correctedValue"
]);

const reply = (sendJson, response, status, code, data = {}) => {
  sendJson(response, status, {
    status: status < 400 ? "ready" : "rejected",
    code,
    ...data
  });
};

const contentType = (request) => {
  if (typeof request.headers?.get === "function") {
    return request.headers.get("content-type") || "";
  }
  return request.headers?.["content-type"] || "";
};

const isJsonContentType = (value) =>
  /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim());

const readCommand = async (request, readRequestBody) => {
  const source = await readRequestBody(request, MAX_COMMAND_BYTES);
  if (Buffer.byteLength(source || "", "utf8") > MAX_COMMAND_BYTES) {
    return { valid: false, code: "request.body-too-large" };
  }

  let body;
  try {
    body = JSON.parse(source);
  } catch {
    return { valid: false, code: "request.json.invalid" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, code: "request.body.invalid" };
  }
  if (Object.keys(body).some((field) => !COMMAND_FIELDS.has(field))) {
    return { valid: false, code: "request.fields.invalid" };
  }
  return { valid: true, body };
};

const commandHttpStatus = (result) => {
  if (result.status === "accepted") {
    return result.idempotent ? 200 : 201;
  }
  if (result.status === "failed") {
    return 503;
  }
  if (["review.key.unknown"].includes(result.code)) {
    return 404;
  }
  if (["review.stale", "review.command.conflict", "review.write-rejected"].includes(
    result.code
  )) {
    return 409;
  }
  return 400;
};

export const createClassifierReviewRouteHandler = ({
  viewService,
  commandService,
  readRequestBody,
  sendJson
} = {}) => {
  if (!viewService || typeof viewService.readReviewView !== "function") {
    throw new TypeError("Classifier review routes require a view service.");
  }
  if (!commandService || typeof commandService.submitReview !== "function") {
    throw new TypeError("Classifier review routes require a command service.");
  }
  if (typeof readRequestBody !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Classifier review routes require HTTP adapters.");
  }

  return async (request, url, response) => {
    if (![VIEW_PATH, COMMAND_PATH].includes(url.pathname)) {
      return false;
    }

    if (url.search) {
      reply(sendJson, response, 400, "request.query.unsupported");
      return true;
    }

    if (url.pathname === VIEW_PATH) {
      if (request.method !== "GET") {
        reply(sendJson, response, 405, "request.method-not-allowed");
        return true;
      }
      const view = await viewService.readReviewView();
      sendJson(response, view.storage.status === "ready" ? 200 : 503, view);
      return true;
    }

    if (request.method !== "POST") {
      reply(sendJson, response, 405, "request.method-not-allowed");
      return true;
    }
    if (!isJsonContentType(contentType(request))) {
      reply(sendJson, response, 415, "request.content-type.invalid");
      return true;
    }

    let parsed;
    try {
      parsed = await readCommand(request, readRequestBody);
    } catch {
      reply(sendJson, response, 400, "request.body.unreadable");
      return true;
    }
    if (!parsed.valid) {
      const status = parsed.code === "request.body-too-large" ? 413 : 400;
      reply(sendJson, response, status, parsed.code);
      return true;
    }

    const commandResult = await commandService.submitReview(parsed.body);
    sendJson(response, commandHttpStatus(commandResult), commandResult);
    return true;
  };
};

export const CLASSIFIER_REVIEW_COMMAND_MAX_BYTES = MAX_COMMAND_BYTES;
