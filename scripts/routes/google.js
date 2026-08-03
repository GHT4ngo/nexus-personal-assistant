import {
  batchSummary,
  normalizeGoogleBatch
} from "../connectors/google/batch.js";
import {
  normalizeGmailMessage,
  normalizeGoogleCalendarEvent
} from "../connectors/google/normalize.js";
import {
  fetchGmailMessages,
  fetchGoogleCalendarEvents
} from "../connectors/google/providers.js";

const googlePaths = new Set([
  "/api/google/status",
  "/api/google/auth-url",
  "/api/google/callback",
  "/api/google/calendar",
  "/api/google/gmail",
  "/api/debug/gmail-first-400"
]);

const mapWithConcurrency = async (items, limit, task) => {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
})[character]);

export const createGoogleRouteHandler = ({
  config,
  googleClient,
  gmailParser,
  readToken,
  scopes,
  sendJson,
  sendText,
  rememberResourceEvent = () => {},
  mailFetchLimit = 25,
  mailParseConcurrency = 2,
  now = () => new Date()
}) => {
  const googleFetch = googleClient.fetchJson;

  return async (request, url, response) => {
    if (!googlePaths.has(url.pathname)) {
      return false;
    }

    if (url.pathname === "/api/google/status") {
      sendJson(response, 200, {
        configured: googleClient.isConfigured(),
        connected: Boolean(readToken()?.refresh_token),
        redirectUri: config.redirectUri,
        scopes
      });
      return true;
    }

    if (url.pathname === "/api/google/auth-url") {
      if (!googleClient.isConfigured()) {
        sendJson(response, 400, {
          message: "Google credentials are missing. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env."
        });
        return true;
      }
      sendJson(response, 200, { url: googleClient.createAuthUrl() });
      return true;
    }

    if (url.pathname === "/api/google/callback") {
      const code = url.searchParams.get("code");
      if (!code || !googleClient.isConfigured()) {
        sendText(
          response,
          400,
          "<h1>Nexus Google connection failed</h1><p>Missing authorization code or credentials.</p>"
        );
        return true;
      }

      const result = await googleClient.exchangeAuthorizationCode(code);
      if (!result.ok) {
        sendText(
          response,
          400,
          `<h1>Nexus Google connection failed</h1><pre>${escapeHtml(JSON.stringify(result.data, null, 2))}</pre>`
        );
        return true;
      }

      sendText(
        response,
        200,
        "<h1>Google connected to Nexus</h1><p>You can close this tab and return to Nexus.</p>"
      );
      return true;
    }

    if (url.pathname === "/api/google/calendar") {
      const result = await fetchGoogleCalendarEvents({ googleFetch, now: now() });
      if (result.status >= 400) {
        sendJson(response, result.status, result.data);
        return true;
      }

      const normalized = normalizeGoogleBatch(
        result.items,
        normalizeGoogleCalendarEvent,
        { normalizedAt: now().toISOString() }
      );
      sendJson(response, 200, {
        items: result.items,
        records: normalized.records,
        normalization: {
          ...batchSummary(normalized, result.items.length),
          failures: normalized.failures,
          duplicates: normalized.duplicates
        }
      });
      return true;
    }

    if (url.pathname === "/api/google/gmail") {
      const startedAt = Date.now();
      const requestedLimit = Number(url.searchParams.get("limit") || 10);
      const gmailResult = await fetchGmailMessages({
        googleFetch,
        requestedLimit,
        fetchLimit: mailFetchLimit,
        pageToken: url.searchParams.get("pageToken"),
        window: url.searchParams.get("window") || "14d",
        concurrency: mailParseConcurrency,
        mapMessage: gmailParser.parseMessage
      });

      if (gmailResult.status >= 400) {
        rememberResourceEvent({
          type: "gmail.list.failed",
          requestedLimit,
          maxResults: gmailResult.maxResults,
          status: gmailResult.status,
          durationMs: Date.now() - startedAt
        });
        sendJson(response, gmailResult.status, gmailResult.data);
        return true;
      }

      const normalized = normalizeGoogleBatch(
        gmailResult.messages,
        normalizeGmailMessage,
        { normalizedAt: now().toISOString() }
      );
      sendJson(response, 200, {
        items: gmailResult.messages,
        records: normalized.records,
        normalization: {
          ...batchSummary(normalized, gmailResult.messages.length),
          failures: normalized.failures,
          duplicates: normalized.duplicates
        },
        nextPageToken: gmailResult.nextPageToken
      });
      rememberResourceEvent({
        type: "gmail.batch.complete",
        requestedLimit,
        maxResults: gmailResult.maxResults,
        returned: gmailResult.messages.length,
        durationMs: Date.now() - startedAt
      });
      return true;
    }

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    const allMessages = [];
    let nextPageToken = "";
    while (allMessages.length < 400) {
      listUrl.searchParams.set("maxResults", String(Math.min(100, 400 - allMessages.length)));
      listUrl.searchParams.set("q", "-category:promotions -in:chats");
      if (nextPageToken) {
        listUrl.searchParams.set("pageToken", nextPageToken);
      } else {
        listUrl.searchParams.delete("pageToken");
      }
      const result = await googleFetch(listUrl);
      if (result.status >= 400) {
        sendJson(response, result.status, result.data);
        return true;
      }
      allMessages.push(...(result.data.messages || []));
      nextPageToken = result.data.nextPageToken || "";
      if (!nextPageToken) {
        break;
      }
    }

    const inspected = await mapWithConcurrency(allMessages, 8, gmailParser.inspectRawMessage);
    const parserCounts = {};
    const blankSamples = [];
    inspected.forEach((item) => {
      parserCounts[item.parser] = (parserCounts[item.parser] || 0) + 1;
      if (item.isBlank && blankSamples.length < 25) {
        blankSamples.push(item);
      }
    });
    sendJson(response, 200, {
      total: inspected.length,
      blank: inspected.filter((item) => item.isBlank).length,
      parserCounts,
      blankSamples
    });
    return true;
  };
};
