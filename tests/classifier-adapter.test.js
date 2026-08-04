import assert from "node:assert/strict";
import test from "node:test";

import {
  classifierContentHash,
  createClassifierAdapter,
  selectClassifierInput
} from "../src/classification/adapter.js";

const record = (overrides = {}) => ({
  recordId: "gmail:synthetic-private-id",
  sourceUrl: "https://example.test/private-source-url",
  attachmentNames: ["private-like-name.pdf"],
  title: "Synthetic project review",
  text: "Can you attend the project review on 2026-08-07 at 10:30?",
  from: "Example Colleague <colleague@example.test>",
  receivedAt: "2026-08-04T09:15:00.000Z",
  hasListUnsubscribe: false,
  ...overrides
});

test("classifier adapter is disabled by default and does not invoke its provider", async () => {
  let calls = 0;
  const adapter = createClassifierAdapter({
    classifier: async () => {
      calls += 1;
      throw new Error("Disabled classifier must not run.");
    },
    modelVersion: "synthetic-classifier/1"
  });

  const result = await adapter.classify(record());

  assert.equal(calls, 0);
  assert.equal(result.classifierEnabled, false);
  assert.equal(result.cache.key, null);
  assert.ok(Object.values(result.suggestions).every((value) => value === null));
});

test("adapter sends only the minimum classifier input", async () => {
  let received = null;
  const adapter = createClassifierAdapter({
    enabled: true,
    modelVersion: "synthetic-classifier/1",
    classifier: async (input) => {
      received = input;
      return {
        suggestions: { topic: null },
        confidence: { topic: 0 },
        evidence: { topic: [] },
        abstained: ["topic"],
        values: {},
        modelVersion: "synthetic-classifier/1"
      };
    }
  });

  await adapter.classify(record());

  assert.deepEqual(received, selectClassifierInput(record()));
  assert.equal("recordId" in received, false);
  assert.equal("sourceUrl" in received, false);
  assert.equal("attachmentNames" in received, false);
});

test("cache key changes with content and classifier version", () => {
  const first = classifierContentHash(record());
  const second = classifierContentHash(record({ text: "Different synthetic text." }));

  assert.equal(first.length, 64);
  assert.notEqual(first, second);
  assert.equal(first, classifierContentHash({
    ...record(),
    recordId: "gmail:different-id",
    sourceUrl: "https://example.test/different"
  }));
});

test("adapter caches by versioned content hash and returns defensive copies", async () => {
  let calls = 0;
  const classifier = async () => {
    calls += 1;
    return {
      suggestions: { topic: "work" },
      confidence: { topic: 0.94 },
      evidence: { topic: ["project"] },
      abstained: [],
      values: {},
      modelVersion: "synthetic-classifier/2"
    };
  };
  const adapter = createClassifierAdapter({
    classifier,
    modelVersion: "synthetic-classifier/2",
    enabled: true
  });

  const first = await adapter.classify(record());
  first.evidence.topic.push("mutation");
  const second = await adapter.classify(record());

  assert.equal(calls, 1);
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.deepEqual(second.evidence.topic, ["project"]);
  assert.match(second.cache.key, /^synthetic-classifier\/2:[a-f0-9]{64}$/);
});

test("off switch bypasses an existing cache and re-enable can reuse it", async () => {
  let calls = 0;
  const adapter = createClassifierAdapter({
    enabled: true,
    modelVersion: "synthetic-classifier/3",
    classifier: async () => {
      calls += 1;
      return {
        suggestions: {},
        confidence: {},
        evidence: {},
        abstained: [],
        values: {},
        modelVersion: "synthetic-classifier/3"
      };
    }
  });

  await adapter.classify(record());
  adapter.setEnabled(false);
  const disabled = await adapter.classify(record());
  adapter.setEnabled(true);
  const restored = await adapter.classify(record());

  assert.equal(disabled.classifierEnabled, false);
  assert.equal(disabled.cache.hit, false);
  assert.equal(restored.cache.hit, true);
  assert.equal(calls, 1);
});

test("version mismatch fails without populating the cache", async () => {
  let calls = 0;
  const adapter = createClassifierAdapter({
    enabled: true,
    modelVersion: "synthetic-classifier/expected",
    classifier: async () => {
      calls += 1;
      return { modelVersion: "synthetic-classifier/wrong" };
    }
  });

  await assert.rejects(() => adapter.classify(record()), /version mismatch/);
  await assert.rejects(() => adapter.classify(record()), /version mismatch/);
  assert.equal(calls, 2);
});
