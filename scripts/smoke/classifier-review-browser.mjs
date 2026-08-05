import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createClassifierReviewHttpApp
} from "../composition/classifier-review-http-app.js";
import { createClassifierStore } from "../storage/classifier-store.js";
import { createClassifierSuggestionRecord } from "../../src/domain/records.js";

const TOKEN = "synthetic-browser-review-token-over-32-bytes";
const CODE = "synthetic-browser-bootstrap-code-over-32-bytes";
const HTML = "<!doctype html><html><head><title>Nexus</title></head><body></body></html>";
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
    suggestedValue: "school",
    confidence: 0.94,
    evidence: ["Synthetic browser evidence"],
    abstained: false,
    modelVersion: "synthetic-classifier/1",
    contentHash: "c".repeat(64),
    observedAt: new Date(now).toISOString(),
    normalizedAt: new Date(now).toISOString()
  })]);

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
    const report = await page.evaluate(async () => {
      const entry = await import(
        "/__nexus/classifier-review/classifier-review-entry.js"
      );
      const started = await entry.startClassifierReviewEntry();
      const beforeClear = entry.classifierReviewEntryStatus();
      const review = await entry.readClassifierReviewView();
      globalThis.dispatchEvent(new PageTransitionEvent("pagehide"));
      const afterClear = entry.classifierReviewEntryStatus();
      const readAfterClear = await entry.readClassifierReviewView();
      return {
        started,
        beforeClear,
        summary: review.view?.summary || null,
        firstPending: review.view?.queues?.pending?.[0] || null,
        afterClear,
        readAfterClear
      };
    });

    assert.deepEqual(report.started, { status: "ready", code: null });
    assert.deepEqual(report.beforeClear, { status: "ready", code: null });
    assert.deepEqual(report.summary, {
      total: 1,
      pending: 1,
      abstained: 0,
      resolved: 0
    });
    assert.match(report.firstPending.subjectKey, /^[a-f0-9]{64}$/);
    assert.notEqual(report.firstPending.subjectKey, "gmail:synthetic-browser");
    assert.equal(report.firstPending.suggestionType, "topic");
    assert.equal(report.firstPending.suggestedValue, "school");
    assert.equal(Object.hasOwn(report.firstPending, "title"), false);
    assert.deepEqual(report.afterClear, { status: "cleared", code: null });
    assert.deepEqual(report.readAfterClear, {
      status: "rejected",
      code: "entry.session.unavailable",
      view: null
    });

    console.log("Browser review smoke test passed.");
    console.log("Automatic bootstrap, privacy-safe queue read, and pagehide teardown verified.");
  } finally {
    await browser?.close();
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
};

await main();
