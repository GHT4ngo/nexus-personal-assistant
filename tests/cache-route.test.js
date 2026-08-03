import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeGmailMessage } from "../scripts/connectors/google/normalize.js";
import { gmailMessageFixture, NORMALIZED_AT } from "./fixtures/google-fixtures.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(testDirectory, "../scripts/local-server.mjs");

const waitForServer = async (url, attempts = 40) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Synthetic cache server did not start.");
};

test("cache route stores only validated normalized records", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "nexus-cache-route-"));
  const port = 18153;
  const server = spawn(process.execPath, [serverPath, String(port)], {
    cwd: root,
    stdio: "ignore"
  });

  context.after(async () => {
    server.kill("SIGTERM");
    await new Promise((resolveClose) => server.once("exit", resolveClose));
    await rm(root, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/api/google/status`);

  const valid = normalizeGmailMessage(gmailMessageFixture, { normalizedAt: NORMALIZED_AT });
  const invalid = { ...valid, from: "" };
  const postResponse = await fetch(`${baseUrl}/api/mail/cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [gmailMessageFixture],
      records: [valid, invalid]
    })
  });
  const postData = await postResponse.json();

  assert.equal(postResponse.status, 200);
  assert.equal(postData.records.length, 1);
  assert.equal(postData.records[0].recordId, valid.recordId);
  assert.equal(postData.normalization.storageRejected.length, 1);

  const getResponse = await fetch(`${baseUrl}/api/mail/cache`);
  const getData = await getResponse.json();
  assert.equal(getData.records.length, 1);
  assert.equal(getData.records[0].recordId, valid.recordId);
});
