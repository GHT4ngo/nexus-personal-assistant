import assert from "node:assert/strict";
import test from "node:test";

import {
  latestOrganizationDecision,
  organizeTodayItems
} from "../src/organization.js";

const items = [
  { recordId: "local:task-later", title: "Later", sortAt: "2026-08-04T12:00:00.000Z" },
  { recordId: "local:task-first", title: "First", sortAt: "2026-08-04T08:00:00.000Z" },
  { recordId: "local:task-review", title: "Review", sortAt: "2026-08-04T09:00:00.000Z" },
  { recordId: "local:task-dismiss", title: "Dismiss", sortAt: "2026-08-04T10:00:00.000Z" }
];

const review = (subjectRecordId, decision, decidedAt) => ({
  subjectRecordId,
  decision,
  decidedAt
});

test("uses the latest auditable decision for a record", () => {
  const reviews = [
    review("local:task-later", "pin", "2026-08-03T10:00:00.000Z"),
    review("local:task-later", "unpin", "2026-08-03T11:00:00.000Z")
  ];

  assert.equal(latestOrganizationDecision(reviews, "local:task-later"), "unpin");
});

test("pins first, defers to review, and omits dismissed items", () => {
  const result = organizeTodayItems(items, [
    review("local:task-later", "pin", "2026-08-03T10:00:00.000Z"),
    review("local:task-review", "review-later", "2026-08-03T10:00:00.000Z"),
    review("local:task-dismiss", "dismiss", "2026-08-03T10:00:00.000Z")
  ]);

  assert.deepEqual(result.visible.map((item) => item.title), ["Later", "First"]);
  assert.deepEqual(result.reviewLater.map((item) => item.title), ["Review"]);
  assert.deepEqual(result.dismissed.map((item) => item.title), ["Dismiss"]);
});

test("a later pin restores an item from review later", () => {
  const result = organizeTodayItems(items, [
    review("local:task-review", "review-later", "2026-08-03T10:00:00.000Z"),
    review("local:task-review", "pin", "2026-08-03T11:00:00.000Z")
  ]);

  assert.equal(result.reviewLater.length, 0);
  assert.equal(result.visible[0].title, "Review");
});
