import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CLASSIFIER_REVIEW_UI_ROOT_ID,
  createClassifierReviewHttpApp
} from "../composition/classifier-review-http-app.js";
import { createClassifierStore } from "../storage/classifier-store.js";
import { createClassifierSuggestionRecord } from "../../src/domain/records.js";

const TOKEN = "synthetic-browser-review-token-over-32-bytes";
const CODE = "synthetic-browser-bootstrap-code-over-32-bytes";
const HOSTILE_VALUE = "<img src=x onerror=globalThis.compromised=true>";
const HTML = `<!doctype html>
<html>
  <head><title>Nexus</title></head>
  <body><main id="${CLASSIFIER_REVIEW_UI_ROOT_ID}"></main></body>
</html>`;
const playwrightModule = process.env.NEXUS_PLAYWRIGHT_MODULE;
const chromiumExecutable = process.env.NEXUS_CHROMIUM_EXECUTABLE;

if (!playwrightModule || !chromiumExecutable) {
  throw new TypeError(
    "Browser smoke test requires NEXUS_PLAYWRIGHT_MODULE and NEXUS_CHROMIUM_EXECUTABLE."
  );
}

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});

const readBrowserModuleSources = async () => ({
  activation: await readFile(new URL(
    "../browser/classifier-review-activate.js",
    import.meta.url
  ), "utf8"),
  client: await readFile(new URL(
    "../browser/classifier-review-bootstrap-client.js",
    import.meta.url
  ), "utf8"),
  entry: await readFile(new URL(
    "../browser/classifier-review-entry.js",
    import.meta.url
  ), "utf8"),
  runtime: await readFile(new URL(
    "../browser/classifier-review-runtime.js",
    import.meta.url
  ), "utf8")
});

const readUiModuleSources = async () => ({
  activation: await readFile(new URL(
    "../browser/classifier-review-ui-activate.js",
    import.meta.url
  ), "utf8"),
  dom: await readFile(new URL(
    "../browser/classifier-review-dom.js",
    import.meta.url
  ), "utf8"),
  renderer: await readFile(new URL(
    "../browser/classifier-review-renderer.js",
    import.meta.url
  ), "utf8"),
  ui: await readFile(new URL(
    "../browser/classifier-review-ui.js",
    import.meta.url
  ), "utf8")
});

const main = async () => {
  const { chromium } = await import(pathToFileURL(playwrightModule).href);
  const directory = await mkdtemp(join(tmpdir(), "nexus-review-browser-"));
  const privateFilePath = join(directory, "private", "classifier.json");
  const now = Date.now();
  const store = createClassifierStore({
    filePath: privateFilePath,
    now: () => new Date(now)
  });
  await store.appendSuggestions([createClassifierSuggestionRecord({
    sourceId: "synthetic-browser",
    title: "Synthetic browser review",
    subjectRecordId: "gmail:synthetic-browser",
    suggestionType: "topic",
    suggestedValue: HOSTILE_VALUE,
    confidence: 0.94,
    evidence: ["Synthetic browser evidence"],
    abstained: false,
    modelVersion: "synthetic-classifier/1",
    contentHash: "c".repeat(64),
    observedAt: new Date(now).toISOString(),
    normalizedAt: new Date(now).toISOString()
  })]);
  const uiModuleSources = await readUiModuleSources();

  let app;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);
      if (await app.handleRequest(request, url, response)) {
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Smoke test failed");
    }
  });
  let browser;
  try {
    await listen(server);
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    app = createClassifierReviewHttpApp({
      environment: {
        NEXUS_CLASSIFIER_REVIEWS: "1",
        NEXUS_CLASSIFIER_REVIEW_PATH: privateFilePath,
        NEXUS_CLASSIFIER_REVIEW_ORIGINS: baseUrl,
        NEXUS_CLASSIFIER_REVIEW_TOKEN: TOKEN
      },
      serverHost: "127.0.0.1",
      documentOrigin: baseUrl,
      documentHtml: HTML,
      browserModuleSources: await readBrowserModuleSources(),
      browserUiModuleSources: uiModuleSources,
      generateBootstrapCode: () => CODE,
      bootstrapNow: () => now,
      now: () => new Date(now)
    });

    browser = await chromium.launch({
      executablePath: chromiumExecutable,
      headless: true
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const root = page.locator(`#${CLASSIFIER_REVIEW_UI_ROOT_ID}`);
    await root.getByRole("heading", { name: "Classifier review" }).waitFor();
    assert.equal(await root.locator("h1").textContent(), "Classifier review");
    assert.equal(await root.locator("form").count(), 1);
    assert.equal(await root.locator("button[type=submit]").count(), 4);
    assert.equal(await root.locator("input[type=text]").count(), 1);
    assert.equal(await root.locator("img").count(), 0);
    assert.equal(await root.locator("script").count(), 0);
    assert.match(await root.textContent(), /<img src=x onerror=/);
    assert.equal(await page.evaluate(() => globalThis.compromised), undefined);

    await root.getByRole("button", { name: "Accept suggestion" }).click();
    await root.getByRole("heading", {
      name: "Reviewed suggestions (1)"
    }).waitFor();
    assert.match(await root.textContent(), /Reviewed suggestions \(1\)/);
    assert.match(await root.textContent(), /Effective value/);
    assert.equal((await store.read()).reviews.length, 1);

    const teardown = await page.evaluate(async () => {
      globalThis.dispatchEvent(new PageTransitionEvent("pagehide"));
      const entry = await import(
        "/__nexus/classifier-review/classifier-review-entry.js"
      );
      return {
        childCount: document.getElementById(
          "nexus-classifier-review-root"
        ).childElementCount,
        entryStatus: entry.classifierReviewEntryStatus(),
        readAfterClear: await entry.readClassifierReviewView()
      };
    });
    assert.equal(teardown.childCount, 0);
    assert.deepEqual(teardown.entryStatus, { status: "cleared", code: null });
    assert.deepEqual(teardown.readAfterClear, {
      status: "rejected",
      code: "entry.session.unavailable",
      view: null
    });

    console.log("Browser review UI smoke test passed.");
    console.log(
      "Safe DOM rendering, real decision refresh, and pagehide teardown verified."
    );
  } finally {
    await browser?.close();
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
};

await main();
