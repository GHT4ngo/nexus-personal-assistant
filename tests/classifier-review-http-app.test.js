import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIFIER_REVIEW_BROWSER_MODULE_PATHS,
  CLASSIFIER_REVIEW_UI_MODULE_PATHS,
  CLASSIFIER_REVIEW_UI_ROOT_ID,
  createClassifierReviewHttpApp
} from "../scripts/composition/classifier-review-http-app.js";

const ORIGIN = "http://127.0.0.1:8050";
const TOKEN = "synthetic-review-http-app-token-over-32-bytes";
const CODE = "synthetic-review-http-app-code-over-32-bytes";
const HTML = "<!doctype html><html><head><title>Nexus</title></head><body></body></html>";
const UI_HTML = `<!doctype html><html><head><title>Nexus</title></head><body><main id="${
  CLASSIFIER_REVIEW_UI_ROOT_ID
}"></main></body></html>`;
const environment = {
  NEXUS_CLASSIFIER_REVIEWS: "1",
  NEXUS_CLASSIFIER_REVIEW_PATH: "/tmp/nexus-review-http-app/classifier.json",
  NEXUS_CLASSIFIER_REVIEW_ORIGINS: ORIGIN,
  NEXUS_CLASSIFIER_REVIEW_TOKEN: TOKEN
};
const browserModuleSources = {
  activation: "import './classifier-review-entry.js';",
  client: "export const client = true;",
  entry: "export const entry = true;",
  runtime: "export const runtime = true;"
};
const browserUiModuleSources = {
  activation: "import './classifier-review-ui.js';",
  dom: "export const dom = true;",
  renderer: "export const renderer = true;",
  ui: "export const ui = true;"
};

const createResponse = () => ({
  headers: {},
  status: null,
  body: "",
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  writeHead(status, headers = {}) {
    this.status = status;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
  },
  end(body = "") {
    this.body = body;
  }
});

const createApp = (overrides = {}) => createClassifierReviewHttpApp({
  environment,
  serverHost: "127.0.0.1",
  documentOrigin: ORIGIN,
  documentHtml: HTML,
  generateBootstrapCode: () => CODE,
  bootstrapNow: () => 1_786_000_000_000,
  ...overrides
});

test("disabled HTTP app provisions nothing and handles no requests", async () => {
  for (const value of [undefined, "", "true", true, 1]) {
    const app = createClassifierReviewHttpApp({
      environment: { NEXUS_CLASSIFIER_REVIEWS: value }
    });
    assert.equal(app.enabled, false);
    assert.equal(await app.handleRequest({}, {}, {}), false);
    assert.deepEqual(Object.keys(app).sort(), ["enabled", "handleRequest"]);
  }
});

test("enabled HTTP app fails closed on document and binding configuration", () => {
  for (const documentOrigin of [undefined, "", "not-an-origin", `${ORIGIN}/path`]) {
    assert.throws(
      () => createApp({ documentOrigin }),
      /explicit document origin/
    );
  }
  assert.throws(
    () => createApp({ documentHtml: "" }),
    /desktop HTML document/
  );
  assert.throws(
    () => createApp({ serverHost: "0.0.0.0" }),
    /loopback binding/
  );
  for (const graph of [
    null,
    {},
    { ...browserModuleSources, extra: "unexpected" },
    { ...browserModuleSources, runtime: "" }
  ]) {
    assert.throws(
      () => createApp({ browserModuleSources: graph }),
      /exact browser module graph/
    );
  }
  assert.throws(
    () => createApp({
      browserModuleSources: {
        ...browserModuleSources,
        entry: `export const leaked = "${TOKEN}";`
      }
    }),
    /private access data/
  );
  for (const graph of [
    null,
    {},
    { ...browserUiModuleSources, extra: "unexpected" },
    { ...browserUiModuleSources, ui: "" }
  ]) {
    assert.throws(
      () => createApp({
        documentHtml: UI_HTML,
        browserModuleSources,
        browserUiModuleSources: graph
      }),
      /exact UI module graph/
    );
  }
  assert.throws(
    () => createApp({ browserUiModuleSources }),
    /requires the runtime module graph/
  );
  for (const documentHtml of [
    HTML,
    UI_HTML.replace("</body>", `<div id="${CLASSIFIER_REVIEW_UI_ROOT_ID}"></div></body>`)
  ]) {
    assert.throws(
      () => createApp({
        documentHtml,
        browserModuleSources,
        browserUiModuleSources
      }),
      /requires one fixed root/
    );
  }
  assert.throws(
    () => createApp({
      documentHtml: UI_HTML,
      browserModuleSources,
      browserUiModuleSources: {
        ...browserUiModuleSources,
        ui: `export const leaked = "${TOKEN}";`
      }
    }),
    /private access data/
  );
});

test("optionally injects and serves an immutable UI module extension", async () => {
  const suppliedUiSources = { ...browserUiModuleSources };
  const app = createApp({
    documentHtml: UI_HTML,
    browserModuleSources,
    browserUiModuleSources: suppliedUiSources
  });
  suppliedUiSources.ui = "export const mutatedAfterCreation = true;";
  const documentResponse = createResponse();
  await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/`),
    documentResponse
  );

  assert.match(
    documentResponse.body,
    /<script type="module" src="\/__nexus\/classifier-review\/classifier-review-ui-activate\.js"><\/script>/
  );
  assert.equal(
    documentResponse.body.includes("classifier-review-activate.js"),
    false
  );
  for (const [name, path] of Object.entries(
    CLASSIFIER_REVIEW_UI_MODULE_PATHS
  )) {
    const response = createResponse();
    assert.equal(await app.handleRequest(
      { method: "GET", headers: {} },
      new URL(`${ORIGIN}${path}`),
      response
    ), true);
    assert.equal(response.status, 200);
    assert.equal(response.body, browserUiModuleSources[name]);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }
  const runtimeEntry = createResponse();
  await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}${CLASSIFIER_REVIEW_BROWSER_MODULE_PATHS.entry}`),
    runtimeEntry
  );
  assert.equal(runtimeEntry.body, browserModuleSources.entry);
});

test("injects and serves an explicit in-memory browser module graph", async () => {
  const suppliedSources = { ...browserModuleSources };
  const app = createApp({ browserModuleSources: suppliedSources });
  suppliedSources.entry = "export const mutatedAfterCreation = true;";
  const documentResponse = createResponse();
  await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/`),
    documentResponse
  );

  assert.match(
    documentResponse.body,
    /<script type="module" src="\/__nexus\/classifier-review\/classifier-review-activate\.js"><\/script>/
  );
  for (const [name, path] of Object.entries(
    CLASSIFIER_REVIEW_BROWSER_MODULE_PATHS
  )) {
    const response = createResponse();
    assert.equal(await app.handleRequest(
      { method: "GET", headers: {} },
      new URL(`${ORIGIN}${path}`),
      response
    ), true);
    assert.equal(response.status, 200);
    assert.equal(response.body, browserModuleSources[name]);
    assert.equal(
      response.headers["content-type"],
      "text/javascript; charset=utf-8"
    );
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }
});

test("module delivery rejects wrong origin, query, and method", async () => {
  const app = createApp({ browserModuleSources });
  const path = CLASSIFIER_REVIEW_BROWSER_MODULE_PATHS.activation;
  const cases = [
    {
      request: { method: "GET", headers: {} },
      url: new URL(`http://localhost:8050${path}`),
      status: 403
    },
    {
      request: { method: "GET", headers: {} },
      url: new URL(`${ORIGIN}${path}?debug=1`),
      status: 400
    },
    {
      request: { method: "POST", headers: {} },
      url: new URL(`${ORIGIN}${path}`),
      status: 405
    }
  ];
  for (const item of cases) {
    const response = createResponse();
    await app.handleRequest(item.request, item.url, response);
    assert.equal(response.status, item.status);
    assert.equal(response.headers["cache-control"], "no-store");
  }
  const unknown = createResponse();
  assert.equal(await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/__nexus/classifier-review/unknown.js`),
    unknown
  ), false);
});

test("serves only the exact dynamic document with secure headers", async () => {
  const app = createApp();
  const valid = createResponse();
  const wrongOrigin = createResponse();
  const query = createResponse();
  const method = createResponse();
  const unrelated = createResponse();

  assert.equal(await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/`),
    valid
  ), true);
  await app.handleRequest(
    { method: "GET", headers: {} },
    new URL("http://localhost:8050/"),
    wrongOrigin
  );
  await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/?debug=1`),
    query
  );
  await app.handleRequest(
    { method: "POST", headers: {} },
    new URL(`${ORIGIN}/`),
    method
  );

  assert.equal(await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/not-owned`),
    unrelated
  ), false);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers["cache-control"], "no-store, max-age=0");
  assert.equal(valid.headers["referrer-policy"], "no-referrer");
  assert.equal(valid.body.includes(CODE), true);
  assert.equal(valid.body.includes(TOKEN), false);
  assert.equal(wrongOrigin.status, 403);
  assert.equal(JSON.parse(wrongOrigin.body).code, "document.origin.denied");
  assert.equal(query.status, 400);
  assert.equal(method.status, 405);
  assert.equal(unrelated.status, null);
});

test("malformed document fails safely without exposing trusted controls", async () => {
  const app = createApp({
    documentHtml: "<html><body>Missing marker</body></html>"
  });
  const response = createResponse();
  await app.handleRequest(
    { method: "GET", headers: {} },
    new URL(`${ORIGIN}/`),
    response
  );

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).code, "document.handoff.unavailable");
  assert.deepEqual(Object.keys(app).sort(), ["enabled", "handleRequest"]);
  assert.equal(Object.isFrozen(app), true);
  assert.equal(JSON.stringify(app).includes(TOKEN), false);
  assert.equal(Object.hasOwn(app, "trustedBootstrap"), false);
});
