import assert from "node:assert/strict";
import test from "node:test";

test("activation module starts without exporting or creating a global capability", async () => {
  const module = await import(
    "../scripts/browser/classifier-review-activate.js"
  );

  assert.deepEqual(Object.keys(module), []);
  for (const name of [
    "nexusClassifierReview",
    "classifierReviewRuntime",
    "classifierReviewToken"
  ]) {
    assert.equal(Object.hasOwn(globalThis, name), false);
  }
});
