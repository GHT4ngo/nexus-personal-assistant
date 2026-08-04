import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createClassifierReviewBootstrapClient
} from "../scripts/browser/classifier-review-bootstrap-client.js";
import {
  createClassifierReviewHttpApp
} from "../scripts/composition/classifier-review-http-app.js";
import { createClassifierStore } from "../scripts/storage/classifier-store.js";
import { createClassifierSuggestionRecord } from "../src/domain/records.js";

const TOKEN = "synthetic-real-http-review-token-over-32-bytes";
const CODE = "synthetic-real-http-bootstrap-code-over-32-bytes";
const CLOCK = 1_786_000_000_000;
const HTML = "<!doctype html><html><head><title>Nexus</title></head><body></body></html>";

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});

const extractHandoff = (body) => {
  const match = body.match(
    /<script type="application\/json" id="nexus-classifier-review-bootstrap">([^<]+)<\/script>/
  );
  assert.ok(match);
  return match[1];
};

test("serves the private desktop lifecycle through real loopback HTTP", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-review-http-"));
  const privateFilePath = join(directory, "private", "classifier.json");
  const store = createClassifierStore({
    filePath: privateFilePath,
    now: () => new Date(CLOCK)
  });
  await store.appendSuggestions([createClassifierSuggestionRecord({
    sourceId: "synthetic-real-http",
    title: "Synthetic HTTP review",
    subjectRecordId: "gmail:synthetic-real-http",
    suggestionType: "topic",
    suggestedValue: "school",
    confidence: 0.94,
    evidence: ["Synthetic HTTP evidence"],
    abstained: false,
    modelVersion: "synthetic-classifier/1",
    contentHash: "a".repeat(64),
    observedAt: new Date(CLOCK).toISOString(),
    normalizedAt: new Date(CLOCK).toISOString()
  })]);

  let app;
  let baseUrl;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);
      if (await app.handleRequest(request, url, response)) {
        return;
      }
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end("Not found");
    } catch {
      response.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(JSON.stringify({
        status: "rejected",
        code: "server.failed"
      }));
    }
  });
  t.after(async () => {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  });
  await listen(server);
  const address = server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
  app = createClassifierReviewHttpApp({
    environment: {
      NEXUS_CLASSIFIER_REVIEWS: "1",
      NEXUS_CLASSIFIER_REVIEW_PATH: privateFilePath,
      NEXUS_CLASSIFIER_REVIEW_ORIGINS: baseUrl,
      NEXUS_CLASSIFIER_REVIEW_TOKEN: TOKEN
    },
    serverHost: "127.0.0.1",
    documentOrigin: baseUrl,
    documentHtml: HTML,
    generateBootstrapCode: () => CODE,
    bootstrapNow: () => CLOCK,
    now: () => new Date(CLOCK)
  });
  const documentResponse = await fetch(`${baseUrl}/`);
  const documentBody = await documentResponse.text();
  const element = {
    textContent: extractHandoff(documentBody),
    removed: false,
    remove() {
      this.removed = true;
    }
  };
  const responses = [];
  const browserFetch = async (path, options = {}) => {
    const method = options.method || "GET";
    const headers = new Headers(options.headers);
    if (method === "GET") {
      headers.set("Sec-Fetch-Site", "same-origin");
    } else {
      headers.set("Origin", baseUrl);
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      method,
      headers
    });
    responses.push({ path, method, response });
    return response;
  };
  const client = createClassifierReviewBootstrapClient({
    document: { getElementById: () => element },
    fetch: browserFetch,
    now: () => CLOCK
  });

  const initialized = await client.initialize();
  const pendingResponse = await client.reviewRequest("/api/classifier/reviews");
  const pendingView = await pendingResponse.json();
  const pending = pendingView.queues.pending[0];
  const commandResponse = await client.reviewRequest(
    "/api/classifier/reviews/commands",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewKey: pending.reviewKey,
        expectedStatus: pending.status,
        commandId: "123e4567-e89b-42d3-a456-426614174002",
        decision: "accept"
      })
    }
  );
  const resolvedResponse = await client.reviewRequest("/api/classifier/reviews");
  const resolvedView = await resolvedResponse.json();
  client.clear();

  assert.deepEqual(initialized, { status: "ready", code: null });
  assert.equal(element.removed, true);
  assert.equal(documentBody.includes(TOKEN), false);
  assert.equal(documentResponse.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(documentResponse.headers.get("referrer-policy"), "no-referrer");
  assert.equal(responses[0].path, "/api/classifier/reviews/bootstrap");
  assert.equal(responses[0].response.headers.get("cache-control"), "no-store");
  assert.equal(responses[0].response.headers.get("access-control-allow-origin"), baseUrl);
  assert.equal(pendingResponse.status, 200);
  assert.equal(pendingResponse.headers.get("cache-control"), "no-store");
  assert.equal(pendingResponse.headers.has("access-control-allow-origin"), false);
  assert.equal(pendingView.summary.pending, 1);
  assert.equal(commandResponse.status, 201);
  assert.equal(commandResponse.headers.get("access-control-allow-origin"), baseUrl);
  assert.equal(resolvedView.summary.pending, 0);
  assert.equal(resolvedView.summary.resolved, 1);
  assert.equal((await store.read()).reviews.length, 1);
  await assert.rejects(
    client.reviewRequest("/api/classifier/reviews"),
    /session is not ready/
  );

  const missingToken = await fetch(`${baseUrl}/api/classifier/reviews`, {
    headers: { "Sec-Fetch-Site": "same-origin" }
  });
  const crossSite = await fetch(`${baseUrl}/api/classifier/reviews`, {
    headers: {
      "Sec-Fetch-Site": "cross-site",
      "X-Nexus-Review-Token": TOKEN
    }
  });
  const oversizedBootstrap = await fetch(
    `${baseUrl}/api/classifier/reviews/bootstrap`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": baseUrl
      },
      body: JSON.stringify({ bootstrapCode: "x".repeat(300) })
    }
  );

  assert.equal(missingToken.status, 403);
  assert.equal((await missingToken.json()).code, "request.token.denied");
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).code, "request.origin.denied");
  assert.equal(oversizedBootstrap.status, 403);
  assert.equal((await oversizedBootstrap.json()).code, "bootstrap.denied");
});
