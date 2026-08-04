import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDeterministicMessageSignals
} from "../src/classification/deterministic-message-signals.js";

const message = (text, overrides = {}) => ({
  title: "Synthetic message",
  text,
  from: "Example Person <person@example.test>",
  hasListUnsubscribe: false,
  ...overrides
});

test("detects a direct reply request and returns the containing sentence", () => {
  const result = classifyDeterministicMessageSignals(message(
    "The invented draft is attached. Could you confirm that you received it?"
  ));

  assert.equal(result.suggestions.needsReply, true);
  assert.deepEqual(result.evidence.needsReply, [
    "Could you confirm that you received it?"
  ]);
});

test("explicit no-reply language overrides a question mark", () => {
  const result = classifyDeterministicMessageSignals(message(
    "Is this your booking reference? No reply is needed."
  ));

  assert.equal(result.suggestions.needsReply, false);
  assert.deepEqual(result.evidence.needsReply, []);
});

test("abstains on an ambiguous question instead of guessing no reply", () => {
  const result = classifyDeterministicMessageSignals(message(
    "The invented FAQ asks: what happens next?"
  ));

  assert.equal(result.suggestions.needsReply, null);
  assert.ok(result.abstained.includes("needsReply"));
});

test("uses only the presence of a list header and does not retain its value", () => {
  const result = classifyDeterministicMessageSignals(message(
    "A synthetic newsletter.",
    {
      headers: {
        listUnsubscribe: "https://example.test/unsubscribe/private-synthetic-token"
      }
    }
  ));

  assert.equal(result.suggestions.automated, true);
  assert.deepEqual(result.evidence.automated, ["List-Unsubscribe header present"]);
  assert.doesNotMatch(JSON.stringify(result), /private-synthetic-token/);
});

test("requires message evidence alongside a role sender", () => {
  const result = classifyDeterministicMessageSignals(message(
    "Hello from this invented shared address.",
    { from: "Example Billing <billing@example.test>" }
  ));

  assert.equal(result.suggestions.automated, null);
  assert.deepEqual(result.abstained, ["automated"]);
});

test("combines a role sender and transactional text without sender history", () => {
  const result = classifyDeterministicMessageSignals(message(
    "This synthetic invoice must be paid by the stated date.",
    { from: "Example Billing <billing@example.test>" }
  ));

  assert.equal(result.suggestions.automated, true);
  assert.match(result.evidence.automated[1], /invoice/);
});

test("uses explicit machine-generation language without sender history", () => {
  const result = classifyDeterministicMessageSignals(message(
    "This automatically generated receipt confirms the invented purchase. Do not reply.",
    { from: "Example Service <service@example.test>" }
  ));

  assert.equal(result.suggestions.automated, true);
  assert.match(result.evidence.automated[0], /automatically generated/);
  assert.equal(result.evidence.automated.some((item) => item.includes("@")), false);
});
