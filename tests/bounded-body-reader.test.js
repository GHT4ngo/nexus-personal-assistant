import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  RequestBodyError,
  createBoundedRequestBodyReader
} from "../scripts/http/bounded-body-reader.js";

const requestWith = (chunks) => {
  const request = new PassThrough();
  queueMicrotask(() => {
    for (const chunk of chunks) {
      request.write(chunk);
    }
    request.end();
  });
  return request;
};

test("reads a request within the requested and default byte limits", async () => {
  const readBody = createBoundedRequestBodyReader({ defaultMaxBytes: 32 });

  assert.equal(await readBody(requestWith(["synthetic", "-", "body"]), 20), "synthetic-body");
});

test("counts UTF-8 bytes across chunks and rejects before buffering excess", async () => {
  const readBody = createBoundedRequestBodyReader({ defaultMaxBytes: 16 });

  await assert.rejects(
    readBody(requestWith(["éé", "é"]), 5),
    (error) => error instanceof RequestBodyError
      && error.code === "request.body-too-large"
      && !error.message.includes("é")
  );
});

test("never allows a caller limit above the configured default", async () => {
  const readBody = createBoundedRequestBodyReader({ defaultMaxBytes: 4 });

  await assert.rejects(
    readBody(requestWith(["12345"]), 100),
    (error) => error.code === "request.body-too-large"
  );
});

test("sanitizes stream errors", async () => {
  const readBody = createBoundedRequestBodyReader();
  const request = new PassThrough();
  const pending = readBody(request);
  request.emit("error", new Error("synthetic private stream detail"));

  await assert.rejects(
    pending,
    (error) => error.code === "request.body.unreadable"
      && !error.message.includes("private stream detail")
  );
});

test("requires a positive default limit", () => {
  assert.throws(
    () => createBoundedRequestBodyReader({ defaultMaxBytes: 0 }),
    /positive defaultMaxBytes/
  );
});
