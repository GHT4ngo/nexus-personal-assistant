import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
      // The synthetic server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Synthetic local-record server did not start.");
};

test("local task persists to the private store through the HTTP server", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "nexus-local-records-"));
  const port = 18154;
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
  await waitForServer(`${baseUrl}/api/local/records`);
  const createdResponse = await fetch(`${baseUrl}/api/local/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Synthetic persisted task",
      dueAt: "2026-08-04T12:00:00.000Z"
    })
  });
  const created = await createdResponse.json();
  const listedResponse = await fetch(`${baseUrl}/api/local/records`);
  const listed = await listedResponse.json();
  const stored = JSON.parse(await readFile(
    join(root, "data", "private", "local-records.json"),
    "utf8"
  ));

  assert.equal(createdResponse.status, 201);
  assert.equal(created.record.recordType, "task");
  assert.equal(listed.tasks.length, 1);
  assert.equal(stored.records.length, 1);
  assert.equal(stored.records[0].title, "Synthetic persisted task");
});
