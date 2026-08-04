import assert from "node:assert/strict";
import { isAbsolute } from "node:path";
import test from "node:test";

import {
  createClassifierReviewServerIntegration
} from "../scripts/composition/classifier-review-server.js";

const TOKEN = "synthetic-review-command-token-32-bytes";
const enabledEnvironment = {
  NEXUS_CLASSIFIER_REVIEWS: "1",
  NEXUS_CLASSIFIER_REVIEW_PATH: "/tmp/nexus-synthetic-private/classifier.json",
  NEXUS_CLASSIFIER_REVIEW_ORIGINS: "http://localhost:8050,http://localhost",
  NEXUS_CLASSIFIER_REVIEW_TOKEN: TOKEN
};
const adapters = {
  sendJson: () => {},
  readRequestBody: async () => "",
  applyCors: () => {},
  sendEmpty: () => {}
};

test("enables only the exact string 1 and otherwise provisions nothing", async () => {
  for (const value of [undefined, "", "true", "01", 1, true]) {
    const integration = createClassifierReviewServerIntegration({
      environment: { NEXUS_CLASSIFIER_REVIEWS: value },
      serverHost: "0.0.0.0"
    });
    assert.equal(integration.enabled, false);
    assert.equal(integration.clientAccess, null);
    assert.equal(await integration.handleRequest({}, {}, {}), false);
  }
});

test("rejects enabled integration on non-loopback bindings", () => {
  for (const serverHost of [undefined, "localhost", "0.0.0.0", "192.168.1.10"]) {
    assert.throws(
      () => createClassifierReviewServerIntegration({
        environment: enabledEnvironment,
        serverHost,
        ...adapters
      }),
      /loopback binding/
    );
  }
});

test("uses explicit enabled configuration without changing private values", () => {
  const integration = createClassifierReviewServerIntegration({
    environment: enabledEnvironment,
    serverHost: "127.0.0.1",
    ...adapters
  });

  assert.equal(integration.enabled, true);
  assert.equal(integration.clientAccess.token, TOKEN);
  assert.deepEqual(integration.clientAccess.allowedOrigins, [
    "http://localhost:8050",
    "http://localhost"
  ]);
  assert.equal(isAbsolute(enabledEnvironment.NEXUS_CLASSIFIER_REVIEW_PATH), true);
});

test("generates an in-memory token when none is configured", () => {
  let generations = 0;
  const integration = createClassifierReviewServerIntegration({
    environment: {
      ...enabledEnvironment,
      NEXUS_CLASSIFIER_REVIEW_TOKEN: ""
    },
    serverHost: "::1",
    ...adapters,
    generateToken: () => {
      generations += 1;
      return TOKEN;
    }
  });

  assert.equal(generations, 1);
  assert.equal(integration.clientAccess.token, TOKEN);
});

test("runtime access values are frozen and not serialized by the handler surface", () => {
  const integration = createClassifierReviewServerIntegration({
    environment: enabledEnvironment,
    serverHost: "127.0.0.1",
    ...adapters
  });

  assert.equal(Object.isFrozen(integration.clientAccess), true);
  assert.equal(Object.isFrozen(integration.clientAccess.allowedOrigins), true);
  assert.equal(String(integration.handleRequest).includes(TOKEN), false);
});
