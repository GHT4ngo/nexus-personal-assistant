import assert from "node:assert/strict";
import test from "node:test";

import { createLocalRecordRouteHandler } from "../scripts/routes/local-records.js";

const timestamps = [
  "2026-08-03T20:00:00.000Z",
  "2026-08-03T20:05:00.000Z",
  "2026-08-03T20:10:00.000Z"
];

const createHarness = () => {
  let store = { schemaVersion: 1, updatedAt: null, records: [] };
  let timeIndex = 0;
  let idIndex = 0;
  const replies = [];
  const handler = createLocalRecordRouteHandler({
    readStore: () => structuredClone(store),
    writeStore: (next) => {
      store = structuredClone(next);
    },
    readRequestBody: async (request) => JSON.stringify(request.body || {}),
    sendJson: (_response, status, data) => replies.push({ status, data }),
    now: () => new Date(timestamps[Math.min(timeIndex++, timestamps.length - 1)]),
    idGenerator: () => `synthetic-${++idIndex}`
  });
  const invoke = async (method, path, body) => {
    replies.length = 0;
    const handled = await handler(
      { method, body },
      new URL(path, "http://localhost:8050"),
      {}
    );
    return { handled, reply: replies[0], store: structuredClone(store) };
  };
  return { invoke };
};

test("creates and lists a validated local task", async () => {
  const { invoke } = createHarness();
  const created = await invoke("POST", "/api/local/tasks", {
    title: "Synthetic local task",
    text: "Created only for a route test.",
    dueAt: "2026-08-04T12:00:00.000Z"
  });

  assert.equal(created.reply.status, 201);
  assert.equal(created.reply.data.record.recordType, "task");
  assert.equal(created.reply.data.record.status, "todo");
  assert.equal(created.store.records.length, 1);

  const listed = await invoke("GET", "/api/local/records");
  assert.equal(listed.reply.status, 200);
  assert.equal(listed.reply.data.tasks.length, 1);
  assert.equal(listed.reply.data.goals.length, 0);
});

test("creates a goal and updates its lifecycle status", async () => {
  const { invoke } = createHarness();
  const created = await invoke("POST", "/api/local/goals", {
    title: "Synthetic local goal",
    targetAt: "2026-08-20T08:00:00.000Z"
  });
  const sourceId = created.reply.data.record.sourceId;
  const updated = await invoke(
    "PATCH",
    `/api/local/goals/${encodeURIComponent(sourceId)}`,
    { status: "paused" }
  );

  assert.equal(updated.reply.status, 200);
  assert.equal(updated.reply.data.record.status, "paused");
  assert.equal(updated.store.records.length, 1);
  assert.equal(updated.store.records[0].processing.normalizedAt, timestamps[1]);
});

test("appends manual organization as auditable review decisions", async () => {
  const { invoke } = createHarness();
  const subjectRecordId = "local:task-synthetic";
  const pinned = await invoke("POST", "/api/local/reviews", {
    subjectRecordId,
    decision: "pin"
  });
  const deferred = await invoke("POST", "/api/local/reviews", {
    subjectRecordId,
    decision: "review-later"
  });

  assert.equal(pinned.reply.status, 201);
  assert.equal(deferred.reply.status, 201);
  assert.equal(deferred.reply.data.reviews.length, 2);
  assert.deepEqual(
    deferred.reply.data.reviews.map((record) => record.decision),
    ["pin", "review-later"]
  );
  assert.ok(deferred.reply.data.reviews.every((record) =>
    record.subjectRecordId === subjectRecordId));
});

test("rejects unsupported manual organization decisions", async () => {
  const { invoke } = createHarness();
  const result = await invoke("POST", "/api/local/reviews", {
    subjectRecordId: "local:task-synthetic",
    decision: "auto-prioritize"
  });

  assert.equal(result.reply.status, 400);
  assert.ok(result.reply.data.errors.some((item) =>
    item.path === "decision" && item.code === "field.enum"));
  assert.equal(result.store.records.length, 0);
});

test("rejects invalid local records with field errors and no submitted text", async () => {
  const { invoke } = createHarness();
  const privateLikeText = "Synthetic text excluded from errors.";
  const result = await invoke("POST", "/api/local/tasks", {
    title: "",
    text: privateLikeText
  });

  assert.equal(result.reply.status, 400);
  assert.ok(result.reply.data.errors.some((item) => item.path === "title"));
  assert.equal(JSON.stringify(result.reply).includes(privateLikeText), false);
  assert.equal(result.store.records.length, 0);
});

test("returns not found for an unknown local record", async () => {
  const { invoke } = createHarness();
  const result = await invoke("PATCH", "/api/local/tasks/task-missing", {
    status: "done"
  });

  assert.equal(result.reply.status, 404);
  assert.equal(result.store.records.length, 0);
});

test("keeps unrelated API paths outside the local record boundary", async () => {
  const { invoke } = createHarness();
  const result = await invoke("GET", "/api/google/status");

  assert.equal(result.handled, false);
  assert.equal(result.reply, undefined);
});
