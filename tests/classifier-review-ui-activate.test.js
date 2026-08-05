import assert from "node:assert/strict";
import test from "node:test";

test("UI activation has no exports or global capability when no root exists", async () => {
  const module = await import(
    "../scripts/browser/classifier-review-ui-activate.js"
  );

  assert.deepEqual(Object.keys(module), []);
  for (const name of [
    "nexusClassifierReview",
    "classifierReviewUi",
    "classifierReviewToken"
  ]) {
    assert.equal(Object.hasOwn(globalThis, name), false);
  }
});
