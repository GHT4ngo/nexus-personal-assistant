import assert from "node:assert/strict";
import test from "node:test";

import {
  createClassifierReviewServerIntegration
} from "../scripts/composition/classifier-review-server.js";
import {
  createClassifierReviewDesktopHandoff
} from "../scripts/services/classifier-review-desktop-handoff.js";

const ORIGIN = "http://localhost:8050";
const TOKEN = "synthetic-review-command-token-32-bytes";
const CODE_ONE = "synthetic-desktop-bootstrap-code-one-32-bytes";
const CODE_TWO = "synthetic-desktop-bootstrap-code-two-32-bytes";
const HTML = "<!doctype html><html><head><title>Nexus</title></head><body></body></html>";
const environment = {
  NEXUS_CLASSIFIER_REVIEWS: "1",
  NEXUS_CLASSIFIER_REVIEW_PATH: "/tmp/nexus-synthetic-private/classifier.json",
  NEXUS_CLASSIFIER_REVIEW_ORIGINS: ORIGIN,
  NEXUS_CLASSIFIER_REVIEW_TOKEN: TOKEN
};
const adapters = {
  sendJson: () => {},
  readRequestBody: async () => "",
  applyCors: () => {},
  sendEmpty: () => {}
};

const createIntegration = (codes = [CODE_ONE]) => {
  let index = 0;
  return createClassifierReviewServerIntegration({
    environment,
    serverHost: "127.0.0.1",
    ...adapters,
    generateBootstrapCode: () => codes[index++]
  });
};

const readPayload = (body) => {
  const match = body.match(
    /<script type="application\/json" id="nexus-classifier-review-bootstrap">([^<]+)<\/script>/
  );
  assert.ok(match);
  return JSON.parse(match[1]);
};

test("renders only an ephemeral bootstrap code into a no-store desktop response", () => {
  const integration = createIntegration();
  const renderer = createClassifierReviewDesktopHandoff({
    trustedBootstrap: integration.trustedBootstrap
  });
  const rendered = renderer.render({ html: HTML, origin: ORIGIN });
  const payload = readPayload(rendered.body);

  assert.equal(rendered.status, "ready");
  assert.equal(payload.bootstrapCode, CODE_ONE);
  assert.equal(payload.bootstrapPath, "/api/classifier/reviews/bootstrap");
  assert.equal(Number.isFinite(payload.expiresAt), true);
  assert.equal(rendered.body.includes(TOKEN), false);
  assert.equal(rendered.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(rendered.headers["Referrer-Policy"], "no-referrer");
  assert.equal(Object.isFrozen(rendered.headers), true);
});

test("optionally injects one fixed activation module without changing the handoff", () => {
  const integration = createIntegration();
  const renderer = createClassifierReviewDesktopHandoff({
    trustedBootstrap: integration.trustedBootstrap,
    activationPath:
      "/__nexus/classifier-review/classifier-review-activate.js"
  });
  const rendered = renderer.render({ html: HTML, origin: ORIGIN });

  assert.match(
    rendered.body,
    /<script type="module" src="\/__nexus\/classifier-review\/classifier-review-activate\.js"><\/script><\/head>/
  );
  assert.equal(readPayload(rendered.body).bootstrapCode, CODE_ONE);
  assert.equal(rendered.body.includes(TOKEN), false);
});

test("reload replaces the first handoff and only the newest code redeems", async () => {
  const replies = [];
  const integrationWithReplies = createClassifierReviewServerIntegration({
    environment,
    serverHost: "127.0.0.1",
    ...adapters,
    sendJson: (_response, status, data) => replies.push({ status, data }),
    readRequestBody: async (request) => request.body,
    generateBootstrapCode: (() => {
      let index = 0;
      return () => [CODE_ONE, CODE_TWO][index++];
    })()
  });
  const rendererWithReplies = createClassifierReviewDesktopHandoff({
    trustedBootstrap: integrationWithReplies.trustedBootstrap
  });
  const replaceFirst = readPayload(
    rendererWithReplies.render({ html: HTML, origin: ORIGIN }).body
  );
  const replaceSecond = readPayload(
    rendererWithReplies.render({ html: HTML, origin: ORIGIN }).body
  );
  const requestRedeem = async (bootstrapCode) => {
    replies.length = 0;
    await integrationWithReplies.handleRequest({
      method: "POST",
      body: JSON.stringify({ bootstrapCode }),
      headers: { origin: ORIGIN, "content-type": "application/json" }
    }, new URL(`${ORIGIN}/api/classifier/reviews/bootstrap`), {});
    return replies[0];
  };

  assert.notEqual(replaceFirst.bootstrapCode, replaceSecond.bootstrapCode);
  assert.equal((await requestRedeem(replaceFirst.bootstrapCode)).status, 403);
  const redeemed = await requestRedeem(replaceSecond.bootstrapCode);
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.data.token, TOKEN);
  assert.equal((await requestRedeem(replaceSecond.bootstrapCode)).status, 403);
});

test("escapes active HTML characters in a generated bootstrap value", () => {
  const maliciousCode = `bootstrap-code-over-32-bytes</script>&\u2028suffix`;
  const renderer = createClassifierReviewDesktopHandoff({
    trustedBootstrap: {
      issue: () => ({
        status: "issued",
        bootstrapCode: maliciousCode,
        expiresAt: 1_786_000_000_000
      })
    }
  });
  const rendered = renderer.render({ html: HTML, origin: ORIGIN });
  const payload = readPayload(rendered.body);

  assert.equal(payload.bootstrapCode, maliciousCode);
  assert.equal(rendered.body.includes("</script>&"), false);
  assert.match(rendered.body, /\\u003c\/script\\u003e\\u0026\\u2028/);
});

test("fails closed before issuance for invalid documents and after denied issuance", () => {
  let calls = 0;
  const renderer = createClassifierReviewDesktopHandoff({
    trustedBootstrap: {
      issue: () => {
        calls += 1;
        return { status: "rejected", code: "bootstrap.origin.denied" };
      }
    }
  });

  assert.equal(renderer.render({ html: "", origin: ORIGIN }).code, "handoff.document.invalid");
  assert.equal(renderer.render({ html: "<html></html>", origin: ORIGIN }).code, "handoff.marker.invalid");
  assert.equal(
    renderer.render({ html: `<head></head></head>`, origin: ORIGIN }).code,
    "handoff.marker.invalid"
  );
  const denied = renderer.render({ html: HTML, origin: "http://not-allowed.test" });
  assert.deepEqual(denied, {
    status: "rejected",
    code: "handoff.issuance.denied",
    body: null,
    headers: null
  });
  assert.equal(calls, 1);
});

test("requires explicit trusted dependencies", () => {
  assert.throws(
    () => createClassifierReviewDesktopHandoff(),
    /trusted bootstrap issuance/
  );
  assert.throws(
    () => createClassifierReviewDesktopHandoff({
      trustedBootstrap: { issue: () => {} },
      marker: ""
    }),
    /explicit HTML marker/
  );
  assert.throws(
    () => createClassifierReviewDesktopHandoff({
      trustedBootstrap: { issue: () => {} },
      activationPath: "https://example.test/collect.js"
    }),
    /safe activation path/
  );
});
