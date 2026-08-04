import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyWithWeakBaseline } from "../evaluation/baselines/weak.js";
import {
  classifyWithDeterministicDates
} from "../evaluation/classifiers/deterministic-dates.js";
import {
  classifyWithDeterministicCore
} from "../evaluation/classifiers/deterministic-core.js";
import {
  assessQualityGates,
  evaluateClassifier
} from "../evaluation/scoring.js";
import { loadEvaluationDataset } from "../evaluation/dataset.js";
import { validateEvaluationDataset } from "../evaluation/schema.js";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

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

test("loads v2 by extending v1 with unique synthetic adversarial cases", async () => {
  const dataset = await loadEvaluationDataset(projectRoot, "v2");

  assert.equal(dataset.datasetId, "nexus-public-synthetic-v2");
  assert.equal(dataset.items.length, 28);
  assert.deepEqual(validateEvaluationDataset(dataset), { valid: true, errors: [] });
  assert.ok(dataset.items.every((item) =>
    JSON.stringify(item).includes("example.test")));
  await assert.rejects(
    () => loadEvaluationDataset(projectRoot, "../private"),
    /Invalid evaluation dataset version/
  );
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

test("measures the deterministic date extractor without guessing other labels", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  const report = evaluateClassifier(dataset, classifyWithDeterministicDates);

  assert.equal(report.classifierVersion, "nexus-deterministic-dates/1");
  assert.equal(report.metrics.binary.hasDeadline.precision, 1);
  assert.equal(report.metrics.binary.hasDeadline.recall, 1);
  assert.equal(report.metrics.binary.calendarCandidate.precision, 1);
  assert.equal(report.metrics.binary.calendarCandidate.recall, 1);
  assert.equal(report.metrics.binary.needsReply.abstentionRate, 1);
  assert.deepEqual(report.metrics.evidence.missing, []);
});

test("measures the deterministic core while urgency and topic still abstain", async () => {
  const dataset = await readJson("../evaluation/fixtures/v1/messages.json");
  const gates = await readJson("../evaluation/quality-gates.json");
  const report = evaluateClassifier(dataset, classifyWithDeterministicCore);
  const assessment = assessQualityGates(report, gates);

  for (const label of [
    "needsReply",
    "hasDeadline",
    "calendarCandidate",
    "automated"
  ]) {
    assert.equal(report.metrics.binary[label].precision, 1);
    assert.equal(report.metrics.binary[label].recall, 1);
  }
  assert.equal(report.metrics.binary.urgent.abstentionRate, 1);
  assert.equal(report.metrics.topic.coverage, 0);
  assert.equal(assessment.passed, false);
  assert.deepEqual(report.metrics.evidence.missing, []);
});

test("preserves known deterministic-core failures on the adversarial v2 dataset", async () => {
  const dataset = await loadEvaluationDataset(projectRoot, "v2");
  const gates = await readJson("../evaluation/quality-gates.json");
  const report = evaluateClassifier(dataset, classifyWithDeterministicCore);
  const assessment = assessQualityGates(report, gates);

  assert.equal(report.metrics.binary.calendarCandidate.recall, 0.8);
  assert.equal(report.metrics.binary.automated.recall, 0.9091);
  assert.equal(report.metrics.binary.needsReply.abstentionRate, 0.037);
  assert.ok(assessment.results.some((result) =>
    result.gate === "calendarCandidate.recall" && !result.passed));
  assert.ok(assessment.results.some((result) =>
    result.gate === "urgent.abstentionRate" && !result.passed));
});
