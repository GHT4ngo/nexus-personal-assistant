import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  createClassifierReviewListener
} from "../scripts/composition/classifier-review-listener.js";

const enabledEnvironment = {
  NEXUS_CLASSIFIER_REVIEW_LISTENER: "1",
  NEXUS_CLASSIFIER_REVIEWS: "1",
  NEXUS_CLASSIFIER_REVIEW_PATH: "/tmp/nexus-listener-test/classifier.json",
  NEXUS_CLASSIFIER_REVIEW_TOKEN: "synthetic-listener-token-over-32-bytes"
};

const closeNodeServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const reservePort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address.port;
  await closeNodeServer(server);
  return port;
};

const createListener = (overrides = {}) => createClassifierReviewListener({
  environment: enabledEnvironment,
  host: "127.0.0.1",
  port: 0,
  documentHtml: "<!doctype html><html><head></head><body></body></html>",
  createHttpApp: () => ({
    enabled: true,
    handleRequest: async (_request, url, response) => {
      if (url.pathname !== "/") {
        return false;
      }
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end("Synthetic listener");
      return true;
    }
  }),
  ...overrides
});

test("disabled listener creates no server and validates nothing else", async () => {
  let serverCreations = 0;
  const listener = createClassifierReviewListener({
    environment: {},
    createNodeServer: () => {
      serverCreations += 1;
    }
  });

  assert.equal(listener.enabled, false);
  assert.deepEqual(listener.status(), { status: "disabled", code: null });
  assert.deepEqual(await listener.start(), {
    status: "rejected",
    code: "listener.disabled"
  });
  assert.deepEqual(await listener.close(), { status: "closed", code: null });
  assert.equal(serverCreations, 0);
});

test("rejects non-loopback hosts, invalid ports, and invalid factories", () => {
  for (const host of [undefined, "", "localhost", "0.0.0.0", "::"]) {
    assert.throws(
      () => createListener({ host }),
      /explicit loopback host/
    );
  }
  for (const port of [undefined, -1, 65_536, 1.5, "8051"]) {
    assert.throws(
      () => createListener({ port }),
      /explicit valid port/
    );
  }
  assert.throws(
    () => createListener({ createHttpApp: null }),
    /app and server factories/
  );
  assert.throws(
    () => createListener({ createNodeServer: () => ({}) }),
    /invalid server/
  );
});

test("binds loopback, derives the exact origin, and serves requests", async (t) => {
  let appOptions;
  const listener = createListener({
    createHttpApp: (options) => {
      appOptions = options;
      return {
        enabled: true,
        handleRequest: async (_request, url, response) => {
          response.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
          });
          response.end(JSON.stringify({ origin: url.origin }));
          return true;
        }
      };
    }
  });
  t.after(() => listener.close());

  const started = await listener.start();
  assert.equal(started.status, "ready");
  assert.match(started.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.deepEqual(listener.status(), {
    status: "ready",
    code: null,
    origin: started.origin
  });
  assert.equal(appOptions.serverHost, "127.0.0.1");
  assert.equal(appOptions.documentOrigin, started.origin);
  assert.equal(
    appOptions.environment.NEXUS_CLASSIFIER_REVIEW_ORIGINS,
    started.origin
  );
  const response = await fetch(`${started.origin}/`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { origin: started.origin });
  assert.deepEqual(await listener.start(), started);
});

test("returns a safe 404 and sanitizes request failures", async (t) => {
  let fail = false;
  const listener = createListener({
    createHttpApp: () => ({
      enabled: true,
      handleRequest: async () => {
        if (fail) {
          throw new Error("private request detail");
        }
        return false;
      }
    })
  });
  t.after(() => listener.close());
  const { origin } = await listener.start();

  const missing = await fetch(`${origin}/missing`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  fail = true;
  const failed = await fetch(`${origin}/private`);
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), {
    status: "rejected",
    code: "listener.request.failed"
  });
});

test("sanitizes HTTP app construction failures and closes the socket", async () => {
  const listener = createListener({
    createHttpApp: () => {
      throw new Error("private path and token");
    }
  });

  assert.deepEqual(await listener.start(), {
    status: "rejected",
    code: "listener.start.failed"
  });
  assert.deepEqual(listener.status(), {
    status: "failed",
    code: "listener.start.failed",
    origin: null
  });
  assert.equal((await listener.start()).code, "listener.start.unavailable");
  assert.deepEqual(await listener.close(), { status: "closed", code: null });
});

test("fails safely on a port conflict without disturbing the owner", async (t) => {
  const port = await reservePort();
  const owner = createListener({ port });
  const conflict = createListener({ port });
  t.after(async () => {
    await conflict.close();
    await owner.close();
  });
  const ownerStarted = await owner.start();

  assert.equal(ownerStarted.status, "ready");
  assert.deepEqual(await conflict.start(), {
    status: "rejected",
    code: "listener.start.failed"
  });
  const response = await fetch(`${ownerStarted.origin}/`);
  assert.equal(response.status, 200);
});

test("close drops request handling, closes the socket, and is idempotent", async () => {
  const listener = createListener();
  const { origin } = await listener.start();

  assert.deepEqual(await listener.close(), { status: "closed", code: null });
  assert.deepEqual(await listener.close(), { status: "closed", code: null });
  assert.deepEqual(listener.status(), {
    status: "closed",
    code: null,
    origin: null
  });
  assert.equal((await listener.start()).code, "listener.start.unavailable");
  await assert.rejects(fetch(`${origin}/`));
});

test("close during startup wins over a late listen callback", async () => {
  let createdServer;
  const listener = createListener({
    createNodeServer: (handler) => {
      const server = createServer(handler);
      createdServer = server;
      const listen = server.listen.bind(server);
      server.listen = (port, host, callback) =>
        listen(port, host, () => setImmediate(callback));
      return server;
    }
  });
  const starting = listener.start();
  const closing = listener.close();

  assert.deepEqual(await starting, {
    status: "rejected",
    code: "listener.start.unavailable"
  });
  assert.deepEqual(await closing, { status: "closed", code: null });
  assert.equal(createdServer.listening, false);
  assert.deepEqual(listener.status(), {
    status: "closed",
    code: null,
    origin: null
  });
});
