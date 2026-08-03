import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleRouteHandler } from "../scripts/routes/google.js";
import {
  calendarEventFixture,
  gmailMessageFixture,
  NORMALIZED_AT
} from "./fixtures/google-fixtures.js";

const config = {
  redirectUri: "http://localhost:8050/api/google/callback"
};
const scopes = ["scope.calendar.readonly", "scope.gmail.readonly"];

const createHarness = ({
  configured = true,
  token = { refresh_token: "synthetic-refresh" },
  googleFetch = async () => ({ status: 200, data: {} }),
  parseMessage = async () => gmailMessageFixture
} = {}) => {
  const replies = [];
  const resourceEvents = [];
  const googleClient = {
    isConfigured: () => configured,
    createAuthUrl: () => "https://accounts.example.test/synthetic-auth",
    exchangeAuthorizationCode: async () => ({ ok: true, data: {} }),
    fetchJson: googleFetch
  };
  const handler = createGoogleRouteHandler({
    config,
    googleClient,
    gmailParser: {
      parseMessage,
      inspectRawMessage: async ({ id }) => ({
        id,
        parser: "postal-mime",
        parserError: "",
        fromDomain: "example.test",
        hasSubject: true,
        textLength: 24,
        isBlank: false
      })
    },
    readToken: () => token,
    scopes,
    sendJson: (_response, status, data) => replies.push({ type: "json", status, data }),
    sendText: (_response, status, data) => replies.push({ type: "text", status, data }),
    rememberResourceEvent: (event) => resourceEvents.push(event),
    mailFetchLimit: 25,
    mailParseConcurrency: 2,
    now: () => new Date(NORMALIZED_AT)
  });

  const invoke = async (path) => {
    replies.length = 0;
    const handled = await handler(
      { method: "GET" },
      new URL(path, "http://localhost:8050"),
      {}
    );
    return { handled, reply: replies[0], resourceEvents };
  };
  return { invoke };
};

test("ignores routes outside the Google boundary", async () => {
  const { invoke } = createHarness();
  const result = await invoke("/api/mail/cache");

  assert.equal(result.handled, false);
  assert.equal(result.reply, undefined);
});

test("reports configured but disconnected Google status", async () => {
  const { invoke } = createHarness({ token: null });
  const result = await invoke("/api/google/status");

  assert.equal(result.handled, true);
  assert.equal(result.reply.status, 200);
  assert.equal(result.reply.data.configured, true);
  assert.equal(result.reply.data.connected, false);
  assert.deepEqual(result.reply.data.scopes, scopes);
});

test("returns a provider error without attempting Calendar normalization", async () => {
  const providerError = { message: "Synthetic provider unavailable" };
  const { invoke } = createHarness({
    googleFetch: async () => ({ status: 503, data: providerError })
  });
  const result = await invoke("/api/google/calendar");

  assert.equal(result.reply.status, 503);
  assert.deepEqual(result.reply.data, providerError);
});

test("preserves the Calendar response contract with validated records", async () => {
  const { invoke } = createHarness({
    googleFetch: async () => ({
      status: 200,
      data: {
        items: [{
          id: calendarEventFixture.id,
          summary: calendarEventFixture.title,
          description: calendarEventFixture.description,
          start: { dateTime: calendarEventFixture.start },
          end: { dateTime: calendarEventFixture.end },
          location: calendarEventFixture.location,
          htmlLink: calendarEventFixture.htmlLink
        }]
      }
    })
  });
  const result = await invoke("/api/google/calendar");

  assert.equal(result.reply.status, 200);
  assert.equal(result.reply.data.items.length, 1);
  assert.equal(result.reply.data.records[0].recordType, "calendar-event");
  assert.deepEqual(result.reply.data.normalization, {
    received: 1,
    accepted: 1,
    failed: 0,
    duplicate: 0,
    failures: [],
    duplicates: []
  });
});

test("preserves the Gmail response contract and pagination token", async () => {
  const { invoke } = createHarness({
    googleFetch: async () => ({
      status: 200,
      data: {
        messages: [{ id: gmailMessageFixture.id }],
        nextPageToken: "synthetic-next"
      }
    })
  });
  const result = await invoke("/api/google/gmail?limit=10&window=30d");

  assert.equal(result.reply.status, 200);
  assert.equal(result.reply.data.items.length, 1);
  assert.equal(result.reply.data.records[0].recordType, "message");
  assert.equal(result.reply.data.nextPageToken, "synthetic-next");
  assert.equal(result.resourceEvents[0].type, "gmail.batch.complete");
});

test("returns Gmail provider failures and records sanitized resource metadata", async () => {
  const providerError = { message: "Synthetic Gmail unavailable" };
  const { invoke } = createHarness({
    googleFetch: async () => ({ status: 429, data: providerError })
  });
  const result = await invoke("/api/google/gmail");

  assert.equal(result.reply.status, 429);
  assert.deepEqual(result.reply.data, providerError);
  assert.equal(result.resourceEvents[0].type, "gmail.list.failed");
  assert.equal(JSON.stringify(result.resourceEvents).includes(providerError.message), false);
});
