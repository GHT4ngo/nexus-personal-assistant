import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createClassifierSuggestionRecord
} from "../src/domain/records.js";
import {
  createClassifierReviewComposition
} from "../scripts/composition/classifier-reviews.js";
import {
  createClassifierStore
} from "../scripts/storage/classifier-store.js";

const NOW = "2026-08-04T12:00:00.000Z";

const suggestion = () => createClassifierSuggestionRecord({
  sourceId: "synthetic-composition-suggestion",
  title: "Synthetic private suggestion",
  subjectRecordId: "gmail:synthetic-private-message",
  suggestionType: "topic",
  suggestedValue: "work",
  confidence: 0.9,
  evidence: ["Synthetic private evidence"],
  abstained: false,
  modelVersion: "synthetic-classifier/1",
  contentHash: "d".repeat(64),
  observedAt: NOW,
  normalizedAt: NOW
});

const httpAdapters = (replies) => ({
  readRequestBody: async (request) => request.body || "",
  sendJson: (_response, status, data) => replies.push({ status, data })
});

const invoke = async (composition, replies, {
  method = "GET",
  path = "/api/classifier/reviews",
  body = "",
  contentType
} = {}) => {
  replies.length = 0;
  const handled = await composition.handleRequest(
    {
      method,
      body,
      headers: contentType ? { "content-type": contentType } : {}
    },
    new URL(path, "http://localhost:8050"),
    {}
  );
  return { handled, reply: replies[0] };
};

test("defaults disabled without requiring a path or HTTP adapters", async () => {
  const composition = createClassifierReviewComposition();
  const result = await composition.handleRequest(
    { method: "GET" },
    new URL("http://localhost:8050/api/classifier/reviews"),
    {}
  );

  assert.equal(composition.enabled, false);
  assert.equal(result, false);
});

test("only literal boolean true enables composition", async () => {
  for (const enabled of ["true", 1, {}, null]) {
    const composition = createClassifierReviewComposition({ enabled });
    assert.equal(composition.enabled, false);
    assert.equal(await composition.handleRequest({}, {}, {}), false);
  }
});

test("disabled composition creates no private file even when a path is supplied", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-disabled-composition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateFilePath = join(directory, "private", "classifier.json");
  const composition = createClassifierReviewComposition({
    enabled: false,
    privateFilePath
  });

  await composition.handleRequest(
    { method: "GET" },
    new URL("http://localhost:8050/api/classifier/reviews"),
    {}
  );

  await assert.rejects(access(privateFilePath), { code: "ENOENT" });
});

test("enabled composition requires an absolute private path and HTTP adapters", () => {
  assert.throws(
    () => createClassifierReviewComposition({ enabled: true }),
    /absolute privateFilePath/
  );
  assert.throws(
    () => createClassifierReviewComposition({
      enabled: true,
      privateFilePath: "data/private/classifier.json"
    }),
    /absolute privateFilePath/
  );
  assert.throws(
    () => createClassifierReviewComposition({
      enabled: true,
      privateFilePath: "/tmp/synthetic-classifier.json"
    }),
    /HTTP adapters/
  );
});

test("enabled composition serves an empty privacy-safe view", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-enabled-composition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const replies = [];
  const composition = createClassifierReviewComposition({
    enabled: true,
    privateFilePath: join(directory, "private", "classifier.json"),
    ...httpAdapters(replies),
    now: () => new Date(NOW)
  });

  const result = await invoke(composition, replies);

  assert.equal(composition.enabled, true);
  assert.equal(result.handled, true);
  assert.equal(result.reply.status, 200);
  assert.deepEqual(result.reply.data.summary, {
    total: 0,
    pending: 0,
    abstained: 0,
    resolved: 0
  });
});

test("composes a complete synthetic view-command-view flow", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-review-composition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateFilePath = join(directory, "private", "classifier.json");
  const seedStore = createClassifierStore({
    filePath: privateFilePath,
    now: () => new Date(NOW)
  });
  await seedStore.appendSuggestions([suggestion()]);
  const replies = [];
  const composition = createClassifierReviewComposition({
    enabled: true,
    privateFilePath,
    ...httpAdapters(replies),
    now: () => new Date(NOW)
  });

  const before = await invoke(composition, replies);
  const pending = before.reply.data.queues.pending[0];
  const submitted = await invoke(composition, replies, {
    method: "POST",
    path: "/api/classifier/reviews/commands",
    contentType: "application/json",
    body: JSON.stringify({
      reviewKey: pending.reviewKey,
      expectedStatus: pending.status,
      commandId: "123e4567-e89b-42d3-a456-426614174000",
      decision: "accept"
    })
  });
  const after = await invoke(composition, replies);
  const stored = await seedStore.read();

  assert.equal(before.reply.data.summary.pending, 1);
  assert.equal(submitted.reply.status, 201);
  assert.equal(after.reply.data.summary.pending, 0);
  assert.equal(after.reply.data.summary.resolved, 1);
  assert.equal(after.reply.data.queues.resolved[0].status, "accepted");
  assert.equal(stored.reviews.length, 1);
});

test("enabled corrupted storage fails safely without exposing path or content", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-corrupt-composition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateFilePath = join(directory, "classifier.json");
  const privateLikeText = "synthetic private malformed content";
  await writeFile(privateFilePath, `{${privateLikeText}`, { mode: 0o600 });
  const replies = [];
  const composition = createClassifierReviewComposition({
    enabled: true,
    privateFilePath,
    ...httpAdapters(replies)
  });

  const result = await invoke(composition, replies);
  const serialized = JSON.stringify(result);

  assert.equal(result.reply.status, 503);
  assert.equal(result.reply.data.storage.code, "store.invalid");
  assert.equal(serialized.includes(privateFilePath), false);
  assert.equal(serialized.includes(privateLikeText), false);
});
