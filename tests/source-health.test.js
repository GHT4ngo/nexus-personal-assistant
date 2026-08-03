import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSyncAge,
  sourceHealthSummary
} from "../src/source-health.js";

const NOW = Date.parse("2026-08-03T20:00:00.000Z");

test("formats missing, invalid, fresh, stale, and future synchronization ages", () => {
  assert.equal(formatSyncAge(null, NOW), "never");
  assert.equal(formatSyncAge("invalid", NOW), "unknown");
  assert.equal(formatSyncAge("2026-08-03T19:59:45.000Z", NOW), "just now");
  assert.equal(formatSyncAge("2026-08-03T19:43:00.000Z", NOW), "17m ago");
  assert.equal(formatSyncAge("2026-08-03T17:00:00.000Z", NOW), "3h ago");
  assert.equal(formatSyncAge("2026-08-01T20:00:00.000Z", NOW), "2d ago");
  assert.equal(formatSyncAge("2026-08-03T20:05:00.000Z", NOW), "just now");
});

test("summarizes healthy, checking, and attention source states", () => {
  assert.equal(sourceHealthSummary({
    server: { status: "healthy" },
    local: { status: "empty" }
  }), "Healthy");
  assert.equal(sourceHealthSummary({
    server: { status: "healthy" },
    calendar: { status: "not-loaded" }
  }), "Checking");
  assert.equal(sourceHealthSummary({
    server: { status: "healthy" },
    gmail: { status: "offline" }
  }), "Attention");
  assert.equal(sourceHealthSummary({
    server: { status: "healthy" },
    google: { status: "disconnected" }
  }), "Attention");
});
