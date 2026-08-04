import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyWithWeakBaseline } from "../evaluation/baselines/weak.js";
import {
  assessQualityGates,
  evaluateClassifier
} from "../evaluation/scoring.js";
import { validateEvaluationDataset } from "../evaluation/schema.js";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("validates the versioned public synthetic evaluation dataset", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  assert.deepEqual(validateEvaluationDataset(dataset), { valid: true, errors: [] });
  assert.ok(dataset.items.every((item) =>
    JSON.stringify(item).includes("example.test")));
});

test("rejects duplicate fixture IDs and malformed labels", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  const invalid = structuredClone(dataset);
  invalid.items[1].id = invalid.items[0].id;
  invalid.items[1].expected.urgent = "maybe";
  const result = validateEvaluationDataset(invalid);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("id must be unique")));
  assert.ok(result.errors.some((message) => message.includes("urgent must be boolean or null")));
});

test("produces a deterministic weak-baseline evaluation report", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  const first = evaluateClassifier(dataset, classifyWithWeakBaseline);
  const second = evaluateClassifier(dataset, classifyWithWeakBaseline);

  assert.deepEqual(first, second);
  assert.equal(first.datasetId, "nexus-public-synthetic-v1");
  assert.equal(first.classifierVersion, "nexus-weak-keywords/1");
  assert.equal(first.itemCount, 12);
  assert.ok(first.metrics.falseUrgentIds.includes("marketing-urgent-word"));
});

test("requires evidence for positive reply and deadline predictions", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  const report = evaluateClassifier(dataset, (message) => {
    const prediction = classifyWithWeakBaseline(message);
    prediction.labels.needsReply = true;
    prediction.evidence.needsReply = [];
    return prediction;
  });

  assert.equal(report.metrics.evidence.missing.length, dataset.items.length);
});

test("documents that the deliberately weak baseline does not pass all gates", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  const gates = await readJson("../evaluation/quality-gates.json");
  const report = evaluateClassifier(dataset, classifyWithWeakBaseline);
  const assessment = assessQualityGates(report, gates);

  assert.equal(assessment.passed, false);
  assert.ok(assessment.results.some((result) => !result.passed));
});
