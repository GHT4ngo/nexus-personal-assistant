import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewBootstrapService
} from "../scripts/services/classifier-review-bootstrap.js";
import {
  createClassifierReviewBootstrapRouteHandler
} from "../scripts/routes/classifier-review-bootstrap.js";

const ORIGIN = "http://localhost:8050";
const TOKEN = "synthetic-review-command-token-32-bytes";
const CODE_ONE = "synthetic-one-time-bootstrap-code-32-bytes";
const CODE_TWO = "synthetic-second-bootstrap-code-32-bytes";

test("issues one origin-bound code and redeems it exactly once", () => {
  const service = createClassifierReviewBootstrapService({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    generateCode: () => CODE_ONE
  });
  const issued = service.issue(ORIGIN);
  const redeemed = service.redeem({
    origin: ORIGIN,
    bootstrapCode: issued.bootstrapCode
  });
  const replay = service.redeem({
    origin: ORIGIN,
    bootstrapCode: issued.bootstrapCode
  });

  assert.equal(issued.status, "issued");
  assert.deepEqual(redeemed, { status: "ready", code: null, token: TOKEN });
  assert.deepEqual(replay, { status: "rejected", code: "bootstrap.denied" });
  assert.equal(service.pendingCount(), 0);
});

test("new issuance replaces the prior code for reload lifecycle", () => {
  let index = 0;
  const service = createClassifierReviewBootstrapService({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    generateCode: () => [CODE_ONE, CODE_TWO][index++]
  });
  const first = service.issue(ORIGIN);
  const second = service.issue(ORIGIN);

  assert.equal(service.redeem({
    origin: ORIGIN,
    bootstrapCode: first.bootstrapCode
  }).code, "bootstrap.denied");
  assert.equal(service.redeem({
    origin: ORIGIN,
    bootstrapCode: second.bootstrapCode
  }).status, "ready");
});

test("expiry, wrong origin, wrong code, and clear share safe rejection", () => {
  let clock = 1_000;
  const service = createClassifierReviewBootstrapService({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    ttlMs: 1_000,
    now: () => clock,
    generateCode: () => CODE_ONE
  });
  const issued = service.issue(ORIGIN);
  const failures = [
    service.redeem({ origin: "http://localhost", bootstrapCode: issued.bootstrapCode }),
    service.redeem({ origin: ORIGIN, bootstrapCode: "wrong-private-code-value-over-32-bytes" })
  ];
  clock = 2_001;
  failures.push(service.redeem({ origin: ORIGIN, bootstrapCode: issued.bootstrapCode }));
  service.issue(ORIGIN);
  service.clear();
  failures.push(service.redeem({ origin: ORIGIN, bootstrapCode: CODE_ONE }));

  assert.ok(failures.every((result) => result.code === "bootstrap.denied"));
  assert.equal(JSON.stringify(failures).includes("private-code"), false);
});

test("HTTP redemption is origin-bound, bounded, no-store adaptable, and non-replayable", async () => {
  const service = createClassifierReviewBootstrapService({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    generateCode: () => CODE_ONE
  });
  const issued = service.issue(ORIGIN);
  const replies = [];
  const calls = {};
  const handler = createClassifierReviewBootstrapRouteHandler({
    service,
    allowedOrigins: [ORIGIN],
    readRequestBody: async (_request, limit) => {
      calls.limit = limit;
      return JSON.stringify({ bootstrapCode: issued.bootstrapCode });
    },
    sendJson: (_response, status, data) => replies.push({ status, data }),
    applyCors: (_response, origin) => {
      calls.origin = origin;
    },
    sendEmpty: () => {}
  });
  const request = {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" }
  };

  await handler(request, new URL(`${ORIGIN}/api/classifier/reviews/bootstrap`), {});
  await handler(request, new URL(`${ORIGIN}/api/classifier/reviews/bootstrap`), {});

  assert.equal(replies[0].status, 200);
  assert.equal(replies[0].data.token, TOKEN);
  assert.equal(replies[1].status, 403);
  assert.equal(calls.limit, 256);
  assert.equal(calls.origin, ORIGIN);
});

test("bootstrap dependencies and security parameters fail closed", () => {
  assert.throws(() => createClassifierReviewBootstrapService(), /strong token/);
  assert.throws(
    () => createClassifierReviewBootstrapService({
      token: TOKEN,
      allowedOrigins: [],
      ttlMs: 999
    }),
    /allowed origins/
  );
  assert.throws(
    () => createClassifierReviewBootstrapRouteHandler(),
    /explicit dependencies/
  );
});
