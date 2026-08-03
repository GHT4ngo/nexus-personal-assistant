import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleClient } from "../scripts/connectors/google/client.js";
import {
  fetchGmailMessages,
  fetchGoogleCalendarEvents
} from "../scripts/connectors/google/providers.js";

const response = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data
});

const config = {
  clientId: "synthetic-client-id",
  clientSecret: "synthetic-client-secret",
  redirectUri: "http://localhost:8050/api/google/callback"
};
const scopes = ["scope.calendar.readonly", "scope.gmail.readonly"];

test("creates a read-only Google authorization URL", () => {
  const client = createGoogleClient({
    config,
    scopes,
    readToken: () => null,
    writeToken: () => {},
    fetchImpl: async () => response(500, {})
  });
  const url = new URL(client.createAuthUrl());

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), scopes.join(" "));
  assert.equal(url.searchParams.get("access_type"), "offline");
});

test("refreshes an expired token before an authenticated request", async () => {
  let token = {
    access_token: "expired-access",
    refresh_token: "synthetic-refresh",
    expires_at: 1
  };
  const calls = [];
  const client = createGoogleClient({
    config,
    scopes,
    readToken: () => token,
    writeToken: (nextToken) => {
      token = nextToken;
    },
    now: () => 1_000_000,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return response(200, { access_token: "fresh-access", expires_in: 3600 });
      }
      return response(200, { items: [] });
    }
  });

  const result = await client.fetchJson("https://example.test/google-data");
  assert.equal(result.status, 200);
  assert.equal(token.access_token, "fresh-access");
  assert.equal(calls[1].options.headers.Authorization, "Bearer fresh-access");
});

test("exchanges an authorization code and persists the resulting token", async () => {
  let saved = null;
  const client = createGoogleClient({
    config,
    scopes,
    readToken: () => null,
    writeToken: (token) => {
      saved = token;
    },
    now: () => 2_000_000,
    fetchImpl: async () => response(200, {
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      expires_in: 1200
    })
  });

  const result = await client.exchangeAuthorizationCode("synthetic-code");
  assert.equal(result.ok, true);
  assert.equal(saved.access_token, "synthetic-access");
  assert.equal(saved.expires_at, 3_200_000);
});

test("returns a disconnected response without making a provider request", async () => {
  let called = false;
  const client = createGoogleClient({
    config,
    scopes,
    readToken: () => null,
    writeToken: () => {},
    fetchImpl: async () => {
      called = true;
      return response(500, {});
    }
  });

  const result = await client.fetchJson("https://example.test/google-data");
  assert.equal(result.status, 401);
  assert.equal(result.data.connected, false);
  assert.equal(called, false);
});

test("maps a synthetic Calendar provider response", async () => {
  let requestedUrl = null;
  const result = await fetchGoogleCalendarEvents({
    googleFetch: async (url) => {
      requestedUrl = new URL(url);
      return {
        status: 200,
        data: {
          items: [{
            id: "synthetic-event",
            summary: "Synthetic event",
            start: { date: "2026-08-05" },
            end: { date: "2026-08-06" }
          }]
        }
      };
    },
    now: new Date("2026-08-03T10:00:00.000Z")
  });

  assert.equal(requestedUrl.searchParams.get("singleEvents"), "true");
  assert.equal(requestedUrl.searchParams.get("timeMin"), "2026-08-03T10:00:00.000Z");
  assert.equal(result.items[0].start, "2026-08-05");
});

test("retrieves and maps a paginated synthetic Gmail batch in provider order", async () => {
  let requestedUrl = null;
  const result = await fetchGmailMessages({
    googleFetch: async (url) => {
      requestedUrl = new URL(url);
      return {
        status: 200,
        data: {
          messages: [{ id: "synthetic-1" }, { id: "synthetic-2" }],
          nextPageToken: "synthetic-next"
        }
      };
    },
    requestedLimit: 10,
    fetchLimit: 25,
    pageToken: "synthetic-page",
    window: "30d",
    concurrency: 2,
    mapMessage: async (message) => ({ ...message, mapped: true })
  });

  assert.equal(requestedUrl.searchParams.get("q"), "newer_than:30d -category:promotions -in:chats");
  assert.equal(requestedUrl.searchParams.get("pageToken"), "synthetic-page");
  assert.deepEqual(result.messages.map((item) => item.id), ["synthetic-1", "synthetic-2"]);
  assert.equal(result.nextPageToken, "synthetic-next");
});

test("passes Gmail provider failures through without mapping messages", async () => {
  let mapped = false;
  const result = await fetchGmailMessages({
    googleFetch: async () => ({ status: 503, data: { message: "Synthetic unavailable" } }),
    requestedLimit: 10,
    fetchLimit: 25,
    mapMessage: async () => {
      mapped = true;
      return {};
    }
  });

  assert.equal(result.status, 503);
  assert.equal(result.messages.length, 0);
  assert.equal(mapped, false);
});
