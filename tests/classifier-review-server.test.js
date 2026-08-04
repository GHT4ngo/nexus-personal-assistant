import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";

import { createClassifierSuggestionRecord } from "../src/domain/records.js";
import {
  createClassifierReviewServerIntegration
} from "../scripts/composition/classifier-review-server.js";
import { createClassifierStore } from "../scripts/storage/classifier-store.js";

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
    assert.equal(integration.trustedBootstrap, null);
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
  assert.equal(typeof integration.trustedBootstrap.issue, "function");
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
  const issued = integration.trustedBootstrap.issue("http://localhost:8050");
  assert.equal(issued.status, "issued");
});

test("trusted bootstrap is frozen and handler surface does not serialize token", () => {
  const integration = createClassifierReviewServerIntegration({
    environment: enabledEnvironment,
    serverHost: "127.0.0.1",
    ...adapters
  });

  assert.equal(Object.isFrozen(integration.trustedBootstrap), true);
  assert.equal(String(integration.handleRequest).includes(TOKEN), false);
});

test("composes one-time bootstrap, private view, command, and resolved view", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-server-bootstrap-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateFilePath = join(directory, "private", "classifier.json");
  const store = createClassifierStore({
    filePath: privateFilePath,
    now: () => new Date("2026-08-04T12:00:00.000Z")
  });
  await store.appendSuggestions([createClassifierSuggestionRecord({
    sourceId: "synthetic-server-bootstrap",
    title: "Synthetic private suggestion",
    subjectRecordId: "gmail:synthetic-private-message",
    suggestionType: "topic",
    suggestedValue: "work",
    confidence: 0.9,
    evidence: ["Synthetic private evidence"],
    abstained: false,
    modelVersion: "synthetic-classifier/1",
    contentHash: "e".repeat(64),
    observedAt: "2026-08-04T12:00:00.000Z",
    normalizedAt: "2026-08-04T12:00:00.000Z"
  })]);
  const replies = [];
  const integration = createClassifierReviewServerIntegration({
    environment: {
      ...enabledEnvironment,
      NEXUS_CLASSIFIER_REVIEW_PATH: privateFilePath
    },
    serverHost: "127.0.0.1",
    sendJson: (_response, status, data) => replies.push({ status, data }),
    readRequestBody: async (request) => request.body || "",
    applyCors: () => {},
    sendEmpty: () => {},
    generateBootstrapCode: () =>
      "synthetic-composed-bootstrap-code-over-32-bytes",
    now: () => new Date("2026-08-04T12:00:00.000Z")
  });
  const request = async ({ method, path, body = "", token }) => {
    replies.length = 0;
    await integration.handleRequest({
      method,
      body,
      headers: {
        origin: "http://localhost:8050",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { "x-nexus-review-token": token } : {})
      }
    }, new URL(`http://localhost:8050${path}`), {});
    return replies[0];
  };

  const issued = integration.trustedBootstrap.issue("http://localhost:8050");
  const redeemed = await request({
    method: "POST",
    path: "/api/classifier/reviews/bootstrap",
    body: JSON.stringify({ bootstrapCode: issued.bootstrapCode })
  });
  const view = await request({
    method: "GET",
    path: "/api/classifier/reviews",
    token: redeemed.data.token
  });
  const pending = view.data.queues.pending[0];
  const command = await request({
    method: "POST",
    path: "/api/classifier/reviews/commands",
    token: redeemed.data.token,
    body: JSON.stringify({
      reviewKey: pending.reviewKey,
      expectedStatus: pending.status,
      commandId: "123e4567-e89b-42d3-a456-426614174000",
      decision: "accept"
    })
  });
  const resolved = await request({
    method: "GET",
    path: "/api/classifier/reviews",
    token: redeemed.data.token
  });

  assert.equal(redeemed.status, 200);
  assert.equal(view.data.summary.pending, 1);
  assert.equal(command.status, 201);
  assert.equal(resolved.data.summary.resolved, 1);
  assert.equal((await store.read()).reviews.length, 1);
});
