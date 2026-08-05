import {
  createClassifierReviewServerIntegration
} from "./classifier-review-server.js";
import {
  createClassifierReviewDesktopHandoff
} from "../services/classifier-review-desktop-handoff.js";

const DOCUMENT_PATH = "/";
const disabledHandler = async () => false;
const MODULE_ROOT = "/__nexus/classifier-review/";
const MODULE_PATHS = Object.freeze({
  activation: `${MODULE_ROOT}classifier-review-activate.js`,
  client: `${MODULE_ROOT}classifier-review-bootstrap-client.js`,
  entry: `${MODULE_ROOT}classifier-review-entry.js`,
  runtime: `${MODULE_ROOT}classifier-review-runtime.js`
});
const MODULE_NAMES = Object.freeze(Object.keys(MODULE_PATHS).sort());

const normalizeOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.pathname === "/" && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

const secureHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
});
const moduleHeaders = Object.freeze({
  ...secureHeaders,
  "Content-Type": "text/javascript; charset=utf-8"
});

const sendJson = (response, status, data) => {
  response.writeHead(status, {
    ...secureHeaders,
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data));
};

const applyCors = (response, origin) => {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Nexus-Review-Token"
  );
  response.setHeader("Vary", "Origin");
  response.setHeader("Cache-Control", "no-store");
};

const sendEmpty = (response, status) => {
  for (const [name, value] of Object.entries(secureHeaders)) {
    response.setHeader(name, value);
  }
  response.writeHead(status);
  response.end();
};

const reject = (response, status, code) => {
  sendJson(response, status, {
    status: "rejected",
    code
  });
  return true;
};

export const createClassifierReviewHttpApp = ({
  environment = {},
  serverHost,
  documentOrigin,
  documentHtml,
  browserModuleSources,
  readRequestBody,
  generateToken,
  generateBootstrapCode,
  bootstrapTtlMs,
  bootstrapNow,
  now
} = {}) => {
  if (environment.NEXUS_CLASSIFIER_REVIEWS !== "1") {
    return Object.freeze({
      enabled: false,
      handleRequest: disabledHandler
    });
  }
  const normalizedDocumentOrigin = normalizeOrigin(documentOrigin);
  if (!normalizedDocumentOrigin) {
    throw new TypeError("Review HTTP app requires an explicit document origin.");
  }
  if (typeof documentHtml !== "string" || documentHtml.length === 0) {
    throw new TypeError("Review HTTP app requires a desktop HTML document.");
  }
  let modules = null;
  if (browserModuleSources !== undefined) {
    if (!browserModuleSources
      || Array.isArray(browserModuleSources)
      || typeof browserModuleSources !== "object"
      || Object.keys(browserModuleSources).sort().join(",")
        !== MODULE_NAMES.join(",")
      || MODULE_NAMES.some((name) =>
        typeof browserModuleSources[name] !== "string"
        || browserModuleSources[name].length === 0)) {
      throw new TypeError("Review HTTP app requires the exact browser module graph.");
    }
    const configuredToken = environment.NEXUS_CLASSIFIER_REVIEW_TOKEN;
    if (typeof configuredToken === "string"
      && configuredToken
      && MODULE_NAMES.some((name) =>
        browserModuleSources[name].includes(configuredToken))) {
      throw new TypeError("Review HTTP app browser modules contain private access data.");
    }
    modules = Object.freeze(Object.fromEntries(MODULE_NAMES.map((name) => [
      MODULE_PATHS[name],
      browserModuleSources[name]
    ])));
  }

  const integration = createClassifierReviewServerIntegration({
    environment,
    serverHost,
    sendJson,
    readRequestBody,
    applyCors,
    sendEmpty,
    generateToken,
    generateBootstrapCode,
    bootstrapTtlMs,
    bootstrapNow,
    now
  });
  const renderer = createClassifierReviewDesktopHandoff({
    trustedBootstrap: integration.trustedBootstrap,
    activationPath: modules ? MODULE_PATHS.activation : null
  });

  const handleRequest = async (request, url, response) => {
    if (await integration.handleRequest(request, url, response)) {
      return true;
    }
    if (url.pathname.startsWith(MODULE_ROOT)) {
      if (!modules || !Object.hasOwn(modules, url.pathname)) {
        return false;
      }
      if (url.origin !== normalizedDocumentOrigin) {
        return reject(response, 403, "module.origin.denied");
      }
      if (url.search) {
        return reject(response, 400, "module.query.unsupported");
      }
      if (request.method !== "GET") {
        return reject(response, 405, "module.method.not-allowed");
      }
      response.writeHead(200, moduleHeaders);
      response.end(modules[url.pathname]);
      return true;
    }
    if (url.pathname !== DOCUMENT_PATH) {
      return false;
    }
    if (url.origin !== normalizedDocumentOrigin) {
      return reject(response, 403, "document.origin.denied");
    }
    if (url.search) {
      return reject(response, 400, "document.query.unsupported");
    }
    if (request.method !== "GET") {
      return reject(response, 405, "document.method.not-allowed");
    }

    let rendered;
    try {
      rendered = renderer.render({
        html: documentHtml,
        origin: normalizedDocumentOrigin
      });
    } catch {
      return reject(response, 503, "document.handoff.unavailable");
    }
    if (rendered.status !== "ready") {
      return reject(response, 503, "document.handoff.unavailable");
    }
    response.writeHead(200, rendered.headers);
    response.end(rendered.body);
    return true;
  };

  return Object.freeze({
    enabled: true,
    handleRequest
  });
};

export const CLASSIFIER_REVIEW_BROWSER_MODULE_PATHS = MODULE_PATHS;
