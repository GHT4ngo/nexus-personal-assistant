import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createClassifierReviewEntry
} from "../scripts/browser/classifier-review-entry.js";
import {
  createClassifierReviewServerIntegration
} from "../scripts/composition/classifier-review-server.js";
import {
  createClassifierReviewDesktopHandoff
} from "../scripts/services/classifier-review-desktop-handoff.js";
import { createClassifierStore } from "../scripts/storage/classifier-store.js";
import { createClassifierSuggestionRecord } from "../src/domain/records.js";

const ORIGIN = "http://localhost:8050";
const TOKEN = "synthetic-desktop-flow-token-over-32-bytes";
const CODE = "synthetic-desktop-flow-bootstrap-over-32-bytes";
const CLOCK = 1_786_000_000_000;
const HTML = "<!doctype html><html><head><title>Nexus</title></head><body></body></html>";

const extractHandoff = (body) => {
  const match = body.match(
    /<script type="application\/json" id="nexus-classifier-review-bootstrap">([^<]+)<\/script>/
  );
  assert.ok(match);
  return match[1];
};

test("composes the complete private desktop review lifecycle without mounting it", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-desktop-flow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateFilePath = join(directory, "private", "classifier.json");
  const store = createClassifierStore({
    filePath: privateFilePath,
    now: () => new Date(CLOCK)
  });
  await store.appendSuggestions([createClassifierSuggestionRecord({
    sourceId: "synthetic-desktop-flow",
    title: "Synthetic desktop review",
    subjectRecordId: "gmail:synthetic-desktop-flow",
    suggestionType: "topic",
    suggestedValue: "school",
    confidence: 0.92,
    evidence: ["Synthetic school evidence"],
    abstained: false,
    modelVersion: "synthetic-classifier/1",
    contentHash: "f".repeat(64),
    observedAt: new Date(CLOCK).toISOString(),
    normalizedAt: new Date(CLOCK).toISOString()
  })]);

  const integration = createClassifierReviewServerIntegration({
    environment: {
      NEXUS_CLASSIFIER_REVIEWS: "1",
      NEXUS_CLASSIFIER_REVIEW_PATH: privateFilePath,
      NEXUS_CLASSIFIER_REVIEW_ORIGINS: ORIGIN,
      NEXUS_CLASSIFIER_REVIEW_TOKEN: TOKEN
    },
    serverHost: "127.0.0.1",
    sendJson: (response, status, data) => {
      response.status = status;
      response.data = data;
    },
    readRequestBody: async (request) => request.body || "",
    applyCors: () => {},
    sendEmpty: (response, status) => {
      response.status = status;
      response.data = null;
    },
    generateBootstrapCode: () => CODE,
    bootstrapNow: () => CLOCK,
    now: () => new Date(CLOCK)
  });
  const renderer = createClassifierReviewDesktopHandoff({
    trustedBootstrap: integration.trustedBootstrap
  });
  const rendered = renderer.render({ html: HTML, origin: ORIGIN });
  const element = {
    textContent: extractHandoff(rendered.body),
    removed: false,
    remove() {
      this.removed = true;
    }
  };
  const transport = async (path, options = {}) => {
    const response = {};
    const suppliedHeaders = new Headers(options.headers);
    const headers = Object.fromEntries(
      [...suppliedHeaders.entries()].map(([name, value]) => [
        name.toLowerCase(),
        value
      ])
    );
    if ((options.method || "GET") === "GET") {
      headers["sec-fetch-site"] = "same-origin";
    } else {
      headers.origin = ORIGIN;
    }
    await integration.handleRequest({
      method: options.method || "GET",
      body: options.body || "",
      headers
    }, new URL(`${ORIGIN}${path}`), response);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: {
        get: (name) => name === "content-type"
          ? "application/json; charset=utf-8"
          : null
      },
      text: async () => JSON.stringify(response.data)
    };
  };
  const lifecycleListeners = new Map();
  const lifecycleTarget = {
    addEventListener: (name, listener) =>
      lifecycleListeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (lifecycleListeners.get(name) === listener) {
        lifecycleListeners.delete(name);
      }
    }
  };
  const entry = createClassifierReviewEntry();

  const initialized = await entry.start({
    document: { getElementById: () => element },
    fetch: transport,
    lifecycleTarget,
    now: () => CLOCK
  });
  const pendingResult = await entry.readReviewView();
  const pendingView = pendingResult.view;
  const pending = pendingView.queues.pending[0];
  const commandResult = await entry.submitReview({
    reviewKey: pending.reviewKey,
    expectedStatus: pending.status,
    commandId: "123e4567-e89b-42d3-a456-426614174001",
    decision: "accept"
  });
  const resolvedResult = await entry.readReviewView();
  const resolvedView = resolvedResult.view;
  lifecycleListeners.get("pagehide")();

  assert.deepEqual(initialized, { status: "ready", code: null });
  assert.equal(element.removed, true);
  assert.equal(element.textContent, "");
  assert.equal(rendered.body.includes(TOKEN), false);
  assert.equal(JSON.stringify(entry).includes(TOKEN), false);
  assert.equal(pendingResult.status, "ready");
  assert.equal(pendingView.summary.pending, 1);
  assert.equal(commandResult.status, "ready");
  assert.equal(commandResult.result.status, "accepted");
  assert.equal(resolvedResult.status, "ready");
  assert.equal(resolvedView.summary.pending, 0);
  assert.equal(resolvedView.summary.resolved, 1);
  assert.equal((await store.read()).reviews.length, 1);
  assert.deepEqual(entry.status(), { status: "cleared", code: null });
  assert.equal(
    (await entry.readReviewView()).code,
    "entry.session.unavailable"
  );
});
