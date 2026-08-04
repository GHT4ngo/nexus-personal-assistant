import assert from "node:assert/strict";
import test from "node:test";

import { createGmailMessageParser } from "../scripts/connectors/google/gmail-parser.js";
import {
  attachmentMime,
  htmlMime,
  plainTextMime
} from "./fixtures/gmail-mime-fixtures.js";

const encodeRaw = (value) => Buffer.from(value, "utf8").toString("base64url");

const parserForRaw = (rawMime, calls = []) => createGmailMessageParser({
  googleFetch: async (url) => {
    calls.push(String(url));
    return { status: 200, data: { raw: encodeRaw(rawMime) } };
  }
});

test("parses a synthetic plain-text MIME message", async () => {
  const calls = [];
  const parser = parserForRaw(plainTextMime, calls);
  const message = await parser.parseMessage({ id: "synthetic-plain" });

  assert.equal(message.subject, "Synthetic plain message");
  assert.equal(message.from, "Synthetic Sender <sender@example.test>");
  assert.equal(message.bodyPreview, "This is a synthetic plain-text message.");
  assert.equal(message.hasListUnsubscribe, true);
  assert.doesNotMatch(JSON.stringify(message), /synthetic-private-token/);
  assert.equal(message.parser, "postal-mime");
  assert.equal(calls.length, 1);
});

test("strips markup from a synthetic HTML-only message", async () => {
  const parser = parserForRaw(htmlMime);
  const message = await parser.parseMessage({ id: "synthetic-html" });

  assert.equal(message.bodyPreview, "Synthetic HTML content.");
  assert.equal(message.bodyPreview.includes("<strong>"), false);
});

test("preserves synthetic attachment filenames", async () => {
  const parser = parserForRaw(attachmentMime);
  const message = await parser.parseMessage({ id: "synthetic-attachment" });

  assert.deepEqual(message.attachmentNames, ["synthetic.pdf"]);
  assert.equal(message.isBlank, false);
});

test("uses the Gmail full-message fallback when raw parsing is incomplete", async () => {
  const calls = [];
  const parser = createGmailMessageParser({
    postalMimeParse: async () => ({ from: null, subject: "", text: "", attachments: [] }),
    googleFetch: async (url) => {
      calls.push(String(url));
      if (String(url).includes("format=raw")) {
        return { status: 200, data: { raw: encodeRaw("Synthetic malformed raw") } };
      }
      return {
        status: 200,
        data: {
          snippet: "Synthetic fallback snippet",
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "From", value: "Fallback Sender <fallback@example.test>" },
              { name: "Subject", value: "Synthetic fallback subject" },
              { name: "Date", value: "Mon, 03 Aug 2026 13:00:00 +0000" }
            ],
            body: { data: encodeRaw("Synthetic fallback body") }
          }
        }
      };
    }
  });
  const message = await parser.parseMessage({ id: "synthetic-fallback" });

  assert.equal(message.subject, "Synthetic fallback subject");
  assert.equal(message.from, "Fallback Sender <fallback@example.test>");
  assert.equal(message.bodyPreview, "Synthetic fallback body");
  assert.equal(message.hasListUnsubscribe, false);
  assert.equal(calls.length, 2);
});

test("reports malformed MIME without including message content in diagnostics", async () => {
  const privateLikeText = "synthetic content excluded from diagnostics";
  const parser = createGmailMessageParser({
    postalMimeParse: async () => {
      throw new Error(`Parser saw ${privateLikeText}`);
    },
    googleFetch: async (url) => String(url).includes("format=raw")
      ? { status: 200, data: { raw: encodeRaw(privateLikeText) } }
      : { status: 200, data: { payload: { headers: [], parts: [] }, snippet: "" } }
  });
  const message = await parser.parseMessage({ id: "synthetic-malformed" });
  const diagnostic = await parser.inspectRawMessage({ id: "synthetic-malformed" });

  assert.equal(message.parser, "postal-mime-error");
  assert.equal(message.parserError, "Postal MIME parser failed.");
  assert.equal(JSON.stringify(diagnostic).includes(privateLikeText), false);
  assert.equal(diagnostic.parserError, "Postal MIME parser failed.");
});
