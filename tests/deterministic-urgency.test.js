import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDeterministicUrgency
} from "../src/classification/deterministic-urgency.js";

const message = (text, overrides = {}) => ({
  title: "Synthetic message",
  text,
  hasListUnsubscribe: false,
  ...overrides
});

test("requires concrete harm and immediacy for a positive urgency suggestion", () => {
  const result = classifyDeterministicUrgency(message(
    "Please call immediately. The invented apartment is flooding."
  ));

  assert.equal(result.suggestions.urgent, true);
  assert.equal(result.evidence.urgent.length, 2);
  assert.ok(result.evidence.urgent.some((item) => /immediately/.test(item)));
  assert.ok(result.evidence.urgent.some((item) => /flooding/.test(item)));
});

test("does not treat the word urgent alone as evidence of harm", () => {
  const result = classifyDeterministicUrgency(message(
    "Urgent: please read this invented administrative update."
  ));

  assert.equal(result.suggestions.urgent, false);
  assert.deepEqual(result.evidence.urgent, []);
});

test("marketing immediacy remains non-urgent", () => {
  const result = classifyDeterministicUrgency(message(
    "Act now. This invented discount expires immediately.",
    { hasListUnsubscribe: true }
  ));

  assert.equal(result.suggestions.urgent, false);
  assert.equal(result.confidence.urgent, 0.98);
});

test("abstains when concrete harm lacks a reliable immediacy cue", () => {
  const result = classifyDeterministicUrgency(message(
    "The invented note mentions a water leak but gives no timing."
  ));

  assert.equal(result.suggestions.urgent, null);
  assert.deepEqual(result.abstained, ["urgent"]);
});

test("promotional framing cannot turn harm vocabulary into urgency", () => {
  const result = classifyDeterministicUrgency(message(
    "Emergency sale: act now before the invented offer disappears.",
    { headers: { listUnsubscribe: "https://example.test/unsubscribe" } }
  ));

  assert.equal(result.suggestions.urgent, false);
});
