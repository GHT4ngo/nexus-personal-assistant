import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDeterministicTopic
} from "../src/classification/deterministic-topic.js";

const message = (text, title = "Synthetic message") => ({ title, text });

test("selects the unique strongest topic and returns matched evidence", () => {
  const result = classifyDeterministicTopic(message(
    "The invented assignment belongs to the database course."
  ));

  assert.equal(result.suggestions.topic, "study");
  assert.deepEqual(result.evidence.topic.sort(), ["assignment", "course", "database"]);
});

test("uses current content only and does not inspect the sender", () => {
  const result = classifyDeterministicTopic({
    title: "Synthetic lunch note",
    text: "Let us discuss lunch.",
    from: "Shared Security <security@example.test>"
  });

  assert.equal(result.suggestions.topic, "personal");
  assert.equal(result.scores.other, 0);
});

test("abstains when two topics have equal evidence", () => {
  const result = classifyDeterministicTopic(message(
    "The invented invoice is for a family note."
  ));

  assert.equal(result.suggestions.topic, null);
  assert.deepEqual(result.abstained, ["topic"]);
  assert.deepEqual(result.evidence.topic, []);
});

test("abstains when content has no reliable broad-topic evidence", () => {
  const result = classifyDeterministicTopic(message(
    "The invented item changed without further context."
  ));

  assert.equal(result.suggestions.topic, null);
});

test("multiple work cues outweigh a single finance mention", () => {
  const result = classifyDeterministicTopic(message(
    "Could you review the invoice wording in the draft?"
  ));

  assert.equal(result.suggestions.topic, "work");
  assert.equal(result.scores.work, 2);
  assert.equal(result.scores.finance, 1);
});
