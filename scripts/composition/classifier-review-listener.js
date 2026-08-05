import { createServer } from "node:http";

import {
  createClassifierReviewHttpApp
} from "./classifier-review-http-app.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const outcome = (status, code = null, data = {}) =>
  Object.freeze({ status, code, ...data });

const originFor = (host, port) =>
  `http://${host === "::1" ? `[${host}]` : host}:${port}`;

const closeServer = (server) => new Promise((resolve) => {
  if (!server.listening) {
    resolve();
    return;
  }
  server.close(() => resolve());
});

export const createClassifierReviewListener = ({
  environment = {},
  host,
  port,
  documentHtml,
  browserModuleSources,
  browserUiModuleSources,
  readRequestBody,
  generateToken,
  generateBootstrapCode,
  bootstrapTtlMs,
  bootstrapNow,
  now,
  createHttpApp = createClassifierReviewHttpApp,
  createNodeServer = createServer
} = {}) => {
  if (environment.NEXUS_CLASSIFIER_REVIEW_LISTENER !== "1") {
    return Object.freeze({
      enabled: false,
      start: async () => outcome("rejected", "listener.disabled"),
      close: async () => outcome("closed"),
      status: () => Object.freeze({ status: "disabled", code: null })
    });
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new TypeError("Review listener requires an explicit loopback host.");
  }
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("Review listener requires an explicit valid port.");
  }
  if (typeof createHttpApp !== "function" || typeof createNodeServer !== "function") {
    throw new TypeError("Review listener requires HTTP app and server factories.");
  }

  let state = "idle";
  let lastCode = null;
  let startPromise = null;
  let app = null;
  let boundOrigin = null;

  const server = createNodeServer(async (request, response) => {
    try {
      if (!app) {
        response.writeHead(503, {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(JSON.stringify({
          status: "rejected",
          code: "listener.unavailable"
        }));
        return;
      }
      const url = new URL(request.url || "/", boundOrigin);
      if (await app.handleRequest(request, url, response)) {
        return;
      }
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      });
      response.end("Not found");
    } catch {
      response.writeHead(500, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(JSON.stringify({
        status: "rejected",
        code: "listener.request.failed"
      }));
    }
  });
  if (!server
    || typeof server.listen !== "function"
    || typeof server.close !== "function") {
    throw new TypeError("Review listener server factory returned an invalid server.");
  }

  const start = () => {
    if (state === "closed" || state === "closing" || state === "failed") {
      return Promise.resolve(outcome("rejected", "listener.start.unavailable"));
    }
    if (startPromise) {
      return startPromise;
    }
    state = "starting";
    startPromise = new Promise((resolve) => {
      const fail = async () => {
        state = "failed";
        lastCode = "listener.start.failed";
        app = null;
        await closeServer(server);
        resolve(outcome("rejected", lastCode));
      };
      server.once("error", fail);
      server.listen(port, host, async () => {
        server.off("error", fail);
        const address = server.address();
        if (!address || typeof address === "string") {
          await fail();
          return;
        }
        boundOrigin = originFor(host, address.port);
        try {
          app = createHttpApp({
            environment: {
              ...environment,
              NEXUS_CLASSIFIER_REVIEW_ORIGINS: boundOrigin
            },
            serverHost: host,
            documentOrigin: boundOrigin,
            documentHtml,
            browserModuleSources,
            browserUiModuleSources,
            readRequestBody,
            generateToken,
            generateBootstrapCode,
            bootstrapTtlMs,
            bootstrapNow,
            now
          });
        } catch {
          await fail();
          return;
        }
        if (!app?.enabled || typeof app.handleRequest !== "function") {
          await fail();
          return;
        }
        if (state === "closing" || state === "closed") {
          app = null;
          await closeServer(server);
          resolve(outcome("rejected", "listener.start.unavailable"));
          return;
        }
        state = "ready";
        lastCode = null;
        resolve(outcome("ready", null, { origin: boundOrigin }));
      });
    });
    return startPromise;
  };

  const close = async () => {
    if (state === "closed") {
      return outcome("closed");
    }
    state = "closing";
    app = null;
    if (startPromise) {
      await startPromise;
    }
    await closeServer(server);
    state = "closed";
    lastCode = null;
    boundOrigin = null;
    return outcome("closed");
  };

  return Object.freeze({
    enabled: true,
    start,
    close,
    status: () => Object.freeze({
      status: state,
      code: lastCode,
      origin: state === "ready" ? boundOrigin : null
    })
  });
};
