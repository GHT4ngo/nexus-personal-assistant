import assert from "node:assert/strict";
import test from "node:test";

import { classifyDeterministicDates } from "../src/classification/deterministic-dates.js";

const message = (text, overrides = {}) => ({
  subject: "Synthetic message",
  text,
  receivedAt: "2026-08-04T08:00:00.000Z",
  ...overrides
});

test("extracts an ISO deadline with exact evidence and normalized value", () => {
  const result = classifyDeterministicDates(message(
    "The invented assignment is due on 2026-08-10 at 16:00."
  ));

  assert.equal(result.suggestions.hasDeadline, true);
  assert.equal(result.suggestions.calendarCandidate, false);
  assert.equal(result.values.hasDeadline, "2026-08-10T16:00");
  assert.match(result.evidence.hasDeadline[0], /due on 2026-08-10 at 16:00/);
});

test("extracts an explicit calendar candidate without turning it into a deadline", () => {
  const result = classifyDeterministicDates(message(
    "Can you attend the project review on 2026-08-07 at 10:30?"
  ));

  assert.equal(result.suggestions.hasDeadline, false);
  assert.equal(result.suggestions.calendarCandidate, true);
  assert.equal(result.values.calendarCandidate, "2026-08-07T10:30");
  assert.match(result.evidence.calendarCandidate[0], /review on 2026-08-07 at 10:30/);
});

test("resolves a weekday relative to the message receipt time", () => {
  const result = classifyDeterministicDates(message(
    "Would you like to meet for dinner on Friday at 19:00?"
  ));

  assert.equal(result.suggestions.calendarCandidate, true);
  assert.equal(result.values.calendarCandidate, "2026-08-07T19:00");
});

test("abstains on a date-like expression it cannot safely normalize", () => {
  const result = classifyDeterministicDates(message(
    "Perhaps we can meet Friday, but the time is not decided."
  ));

  assert.equal(result.suggestions.hasDeadline, null);
  assert.equal(result.suggestions.calendarCandidate, null);
  assert.deepEqual(result.abstained, ["hasDeadline", "calendarCandidate"]);
  assert.deepEqual(result.evidence.calendarCandidate, []);
});

test("does not treat an unsupported malformed date as a confident suggestion", () => {
  const result = classifyDeterministicDates(message(
    "The invented appointment may be on 2026/99/99."
  ));

  assert.equal(result.suggestions.hasDeadline, null);
  assert.equal(result.suggestions.calendarCandidate, null);
});

test("rejects an impossible ISO calendar date instead of rolling it forward", () => {
  const result = classifyDeterministicDates(message(
    "The invented appointment may be on 2026-02-31 at 10:00."
  ));

  assert.equal(result.suggestions.hasDeadline, null);
  assert.equal(result.suggestions.calendarCandidate, null);
});
