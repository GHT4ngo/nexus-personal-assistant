import { randomBytes } from "node:crypto";

import {
  createClassifierReviewComposition
} from "./classifier-reviews.js";
import {
  createBoundedRequestBodyReader
} from "../http/bounded-body-reader.js";

const loopbackHosts = new Set(["127.0.0.1", "::1"]);

const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const defaultApplyCors = (response, origin) => {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Nexus-Review-Token"
  );
  response.setHeader("Vary", "Origin");
  response.setHeader("Cache-Control", "no-store");
};

const defaultSendEmpty = (response, status) => {
  response.writeHead(status);
  response.end();
};

export const createClassifierReviewServerIntegration = ({
  environment = {},
  serverHost,
  sendJson,
  readRequestBody = createBoundedRequestBodyReader(),
  applyCors = defaultApplyCors,
  sendEmpty = defaultSendEmpty,
  generateToken = () => randomBytes(32).toString("base64url"),
  now
} = {}) => {
  const enabled = environment.NEXUS_CLASSIFIER_REVIEWS === "1";
  if (!enabled) {
    const disabled = createClassifierReviewComposition();
    return {
      enabled: false,
      handleRequest: disabled.handleRequest,
      clientAccess: null
    };
  }
  if (!loopbackHosts.has(serverHost)) {
    throw new TypeError("Classifier review server integration requires loopback binding.");
  }

  const configuredToken = environment.NEXUS_CLASSIFIER_REVIEW_TOKEN;
  const commandToken = configuredToken || generateToken();
  const allowedOrigins = parseOrigins(
    environment.NEXUS_CLASSIFIER_REVIEW_ORIGINS
  );
  const composition = createClassifierReviewComposition({
    enabled: true,
    privateFilePath: environment.NEXUS_CLASSIFIER_REVIEW_PATH,
    allowedOrigins,
    commandToken,
    readRequestBody,
    sendJson,
    applyCors,
    sendEmpty,
    now
  });

  return {
    enabled: true,
    handleRequest: composition.handleRequest,
    clientAccess: Object.freeze({
      token: commandToken,
      allowedOrigins: Object.freeze([...allowedOrigins])
    })
  };
};
