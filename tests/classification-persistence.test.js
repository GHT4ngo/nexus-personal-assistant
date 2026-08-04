import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createClassifierAdapter } from "../src/classification/adapter.js";
import { createClassificationPipeline } from "../src/classification/pipeline.js";
import { createMessageRecord } from "../src/domain/records.js";
import {
  createClassificationPersistenceService
} from "../scripts/services/classification-persistence.js";
import {
  ClassifierStoreError,
  createClassifierStore
} from "../scripts/storage/classifier-store.js";

const NOW = "2026-08-04T12:00:00.000Z";

const message = (sourceId, overrides = {}) => createMessageRecord({
  sourceId,
  title: "Synthetic project review",
  text: "Can you attend the project review on 2026-08-07 at 10:30?",
  receivedAt: NOW,
  from: "Example Colleague <colleague@example.test>",
  normalizedAt: NOW,
  ...overrides
});

const fixture = async ({ enabled = false } = {}) => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-classification-service-"));
  const filePath = join(directory, "private", "classifier.json");
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled }),
    now: () => NOW
  });
  const store = createClassifierStore({
    filePath,
    now: () => new Date(NOW)
  });
  return {
    directory,
    filePath,
    store,
    service: createClassificationPersistenceService({ pipeline, store })
  };
};

test("requires an explicit classifier store dependency", () => {
  assert.throws(
    () => createClassificationPersistenceService(),
    /requires a classifier store/
  );
});

test("disabled service short-circuits without invoking pipeline or storage", async () => {
  let classified = 0;
  let written = 0;
  const pipeline = {
    classifyRecords: async () => {
      classified += 1;
      return {};
    },
    clearCache: () => {},
    isEnabled: () => false,
    setEnabled: () => {}
  };
  const store = {
    appendSuggestions: async () => {
      written += 1;
      return {};
    }
  };
  const service = createClassificationPersistenceService({ pipeline, store });

  const result = await service.processRecords([message("synthetic-disabled")]);

  assert.equal(classified, 0);
  assert.equal(written, 0);
  assert.equal(result.storage.status, "disabled");
  assert.deepEqual(result.summary, {
    received: 1,
    processed: 0,
    skipped: 0,
    failed: 0,
    suggestions: 0,
    persisted: 0,
    idempotent: 0,
    rejected: 0,
    classifierEnabled: false
  });
});

test("explicitly enabled service classifies and persists suggestions", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  context.service.setEnabled(true);

  const result = await context.service.processRecords([
    message("synthetic-one"),
    message("synthetic-two")
  ]);
  const stored = await context.store.read();

  assert.equal(result.summary.suggestions, 12);
  assert.equal(result.summary.persisted, 12);
  assert.equal(result.summary.idempotent, 0);
  assert.equal(result.storage.status, "ready");
  assert.equal(stored.suggestions.length, 12);
  assert.equal(stored.reviews.length, 0);
});

test("reprocessing identical input is idempotent", async (t) => {
  const context = await fixture({ enabled: true });
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const records = [message("synthetic-repeat")];

  const first = await context.service.processRecords(records);
  const second = await context.service.processRecords(records);

  assert.equal(first.summary.persisted, 6);
  assert.equal(second.summary.persisted, 0);
  assert.equal(second.summary.idempotent, 6);
  assert.equal((await context.store.read()).suggestions.length, 6);
});

test("returns only aggregated pipeline codes, counts, and no record content", async (t) => {
  const context = await fixture({ enabled: true });
  t.after(() => rm(context.directory, { recursive: true, force: true }));
  const privateLikeText = "synthetic private message body excluded from result";
  const invalid = {
    ...message("synthetic-invalid", { text: privateLikeText }),
    from: ""
  };

  const result = await context.service.processRecords([invalid]);
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.diagnostics.pipeline, { "record.invalid": 1 });
  assert.equal(serialized.includes(invalid.recordId), false);
  assert.equal(serialized.includes(privateLikeText), false);
  assert.equal(serialized.includes("suggestions"), true);
});

test("sanitizes known storage failures and does not expose their message", async () => {
  const privateLikeText = "synthetic private storage failure";
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled: true }),
    now: () => NOW
  });
  const store = {
    appendSuggestions: async () => {
      throw new ClassifierStoreError(
        "store.invalid",
        `Store contained ${privateLikeText}`
      );
    }
  };
  const service = createClassificationPersistenceService({ pipeline, store });

  const result = await service.processRecords([message("synthetic-store-failure")]);

  assert.equal(result.storage.status, "failed");
  assert.equal(result.storage.code, "store.invalid");
  assert.deepEqual(result.diagnostics.storage, { "store.invalid": 1 });
  assert.equal(result.summary.rejected, 6);
  assert.equal(JSON.stringify(result).includes(privateLikeText), false);
});

test("maps unknown storage failures to one stable code", async () => {
  const pipeline = createClassificationPipeline({
    adapter: createClassifierAdapter({ enabled: true }),
    now: () => NOW
  });
  const store = {
    appendSuggestions: async () => {
      throw new Error("synthetic secret provider detail");
    }
  };
  const service = createClassificationPersistenceService({ pipeline, store });

  const result = await service.processRecords([message("synthetic-unknown-failure")]);

  assert.equal(result.storage.code, "store.failed");
  assert.deepEqual(result.diagnostics.storage, { "store.failed": 1 });
  assert.equal(JSON.stringify(result).includes("secret provider detail"), false);
});

test("does not return or persist action-bearing records", async (t) => {
  const context = await fixture({ enabled: true });
  t.after(() => rm(context.directory, { recursive: true, force: true }));

  const result = await context.service.processRecords([message("synthetic-no-actions")]);
  const source = await readFile(context.filePath, "utf8");

  assert.equal(JSON.stringify(result).includes("recordType"), false);
  assert.equal(
    ["task", "calendar-event", "approval-request", "action-history"].some((type) =>
      source.includes(`"recordType": "${type}"`)),
    false
  );
});
