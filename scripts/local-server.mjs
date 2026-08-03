import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus, freemem, loadavg, totalmem, uptime } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

import { createGoogleClient } from "./connectors/google/client.js";
import { createGmailMessageParser } from "./connectors/google/gmail-parser.js";
import { normalizeGoogleBatch, batchSummary } from "./connectors/google/batch.js";
import { normalizeGmailMessage } from "./connectors/google/normalize.js";
import { createGoogleRouteHandler } from "./routes/google.js";
import { mergeStoredRecords } from "./storage/record-store.js";

const root = resolve(process.cwd());
const port = Number(process.argv[2] || 8050);
const mailFetchLimit = Number(process.env.NEXUS_MAIL_FETCH_LIMIT || 25);
const mailParseConcurrency = Number(process.env.NEXUS_MAIL_PARSE_CONCURRENCY || 2);
const tokenPath = join(root, "data", "private", "google-token.json");
const mailCachePath = join(root, "data", "private", "mail-cache.json");
const resourceLogPath = join(root, "logs", "resource-metrics.jsonl");
const googleScopes = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly"
];
const recentResourceEvents = [];
const recentApiRequests = [];

loadEnvFile();

const config = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/api/google/callback`
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const sendJson = (response, status, data) => {
  response.writeHead(status, { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data, null, 2));
};

const sendText = (response, status, text) => {
  response.writeHead(status, { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" });
  response.end(text);
};

const readToken = () => {
  if (!existsSync(tokenPath)) {
    return null;
  }

  return JSON.parse(readFileSync(tokenPath, "utf8"));
};

const writeToken = (token) => {
  mkdirSync(join(root, "data", "private"), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
};

const googleClient = createGoogleClient({
  config,
  scopes: googleScopes,
  readToken,
  writeToken
});
const gmailParser = createGmailMessageParser({ googleFetch: googleClient.fetchJson });

const readJsonFile = (filePath, fallback) => {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
};

const readMailCache = () => {
  const cache = readJsonFile(mailCachePath, { items: [], records: [], updatedAt: null });
  const items = Array.isArray(cache.items) ? cache.items : [];
  const records = Array.isArray(cache.records) ? cache.records : [];
  return {
    items,
    records,
    updatedAt: cache.updatedAt || null
  };
};

const mergeMailCache = (incomingItems = [], incomingRecords = []) => {
  const cache = readMailCache();
  const byId = new Map(cache.items.map((item) => [item.id, item]));

  for (const item of incomingItems) {
    if (!item?.id) {
      continue;
    }

    byId.set(item.id, {
      ...byId.get(item.id),
      ...item,
      cachedAt: new Date().toISOString()
    });
  }

  const items = [...byId.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const storedRecords = mergeStoredRecords(cache.records, incomingRecords);
  const nextCache = {
    updatedAt: new Date().toISOString(),
    items,
    records: storedRecords.records,
    rejectedRecords: storedRecords.rejected
  };
  writeJsonFile(mailCachePath, nextCache);
  return nextCache;
};

const writeJsonFile = (filePath, value) => {
  mkdirSync(join(root, "data", "private"), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const mb = (value) => Math.round(value / 1024 / 1024);

const readDiskSnapshot = () => {
  try {
    const stats = statfsSync(root);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    return {
      totalMb: mb(total),
      freeMb: mb(free),
      usedPercent: total ? Math.round(((total - free) / total) * 100) : null
    };
  } catch (error) {
    return {
      totalMb: null,
      freeMb: null,
      usedPercent: null
    };
  }
};

const readResourceSnapshot = () => {
  const memory = process.memoryUsage();
  const totalMemory = totalmem();
  const freeMemory = freemem();
  return {
    timestamp: new Date().toISOString(),
    system: {
      memoryTotalMb: mb(totalMemory),
      memoryFreeMb: mb(freeMemory),
      memoryUsedPercent: totalMemory ? Math.round(((totalMemory - freeMemory) / totalMemory) * 100) : null,
      cpuCount: cpus().length,
      loadAverage: loadavg(),
      uptimeSeconds: Math.round(uptime()),
      disk: readDiskSnapshot()
    },
    nexus: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: mb(memory.rss),
      heapUsedMb: mb(memory.heapUsed),
      heapTotalMb: mb(memory.heapTotal),
      externalMb: mb(memory.external)
    },
    limits: {
      mailFetchLimit,
      mailParseConcurrency
    }
  };
};

const rememberResourceEvent = (event) => {
  const entry = {
    ...event,
    resources: readResourceSnapshot()
  };
  recentResourceEvents.unshift(entry);
  recentResourceEvents.splice(12);

  try {
    mkdirSync(join(root, "logs"), { recursive: true });
    appendFileSync(resourceLogPath, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    // Resource logging should never break Nexus itself.
  }
};

const handleGoogleRoute = createGoogleRouteHandler({
  config,
  googleClient,
  gmailParser,
  readToken,
  scopes: googleScopes,
  sendJson,
  sendText,
  rememberResourceEvent,
  mailFetchLimit,
  mailParseConcurrency
});

const rememberApiRequest = (request, url) => {
  recentApiRequests.unshift({
    timestamp: new Date().toISOString(),
    method: request.method,
    path: url.pathname,
    query: url.search ? url.search.slice(0, 160) : ""
  });
  recentApiRequests.splice(30);
};

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const parseIcsDate = (value) => {
  if (!value) {
    return "";
  }

  const cleaned = value.replace(/^TZID=[^:]+:/, "").replace(/Z$/, "");
  const dateMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const dateTimeMatch = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!dateTimeMatch) {
    return value;
  }

  return `${dateTimeMatch[1]}-${dateTimeMatch[2]}-${dateTimeMatch[3]}T${dateTimeMatch[4]}:${dateTimeMatch[5]}:${dateTimeMatch[6]}`;
};

const decodeIcsText = (value = "") =>
  value
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .trim();

const parseIcs = (content) => {
  const unfolded = content.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  return events
    .map((event, index) => {
      const lines = event.split(/\r?\n/);
      const field = (name) => {
        const line = lines.find((item) => item.toUpperCase().startsWith(name));
        if (!line) {
          return "";
        }

        return line.slice(line.indexOf(":") + 1);
      };

      return {
        id: field("UID") || `ics-${index}`,
        title: decodeIcsText(field("SUMMARY")) || "Untitled event",
        start: parseIcsDate(field("DTSTART")),
        end: parseIcsDate(field("DTEND")),
        location: decodeIcsText(field("LOCATION")),
        description: decodeIcsText(field("DESCRIPTION")),
        source: "ics"
      };
    })
    .filter((event) => event.start)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
};

const handleApi = async (request, url, response) => {
  if (await handleGoogleRoute(request, url, response)) {
    return true;
  }

  if (url.pathname === "/api/ics") {
    const icsUrl = url.searchParams.get("url");
    if (!icsUrl || !/^https?:\/\//i.test(icsUrl)) {
      sendJson(response, 400, { message: "Paste a valid http or https .ics calendar URL." });
      return true;
    }

    const icsResponse = await fetch(icsUrl);
    if (!icsResponse.ok) {
      sendJson(response, icsResponse.status, { message: "Could not load the ICS calendar." });
      return true;
    }

    const content = await icsResponse.text();
    const now = Date.now();
    const items = parseIcs(content)
      .filter((event) => {
        const eventTime = new Date(event.start).getTime();
        return Number.isNaN(eventTime) || eventTime >= now - 86_400_000;
      })
      .slice(0, 25);

    sendJson(response, 200, { items });
    return true;
  }

  if (url.pathname === "/api/system/resources") {
    sendJson(response, 200, {
      current: readResourceSnapshot(),
      recent: recentResourceEvents,
      recentApiRequests
    });
    return true;
  }

  if (url.pathname === "/api/mail/cache" && request.method === "GET") {
    sendJson(response, 200, readMailCache());
    return true;
  }

  if (url.pathname === "/api/mail/cache" && request.method === "POST") {
    const body = JSON.parse(await readRequestBody(request) || "{}");
    const items = Array.isArray(body.items) ? body.items : [];
    const suppliedRecords = Array.isArray(body.records) ? body.records : [];
    const fallbackBatch = suppliedRecords.length
      ? { records: suppliedRecords, failures: [], duplicates: [] }
      : normalizeGoogleBatch(items, normalizeGmailMessage, { normalizedAt: new Date().toISOString() });
    const cache = mergeMailCache(items, fallbackBatch.records);
    sendJson(response, 200, {
      items: cache.items,
      records: cache.records,
      updatedAt: cache.updatedAt,
      total: cache.items.length,
      normalization: {
        ...batchSummary(fallbackBatch, items.length),
        failures: fallbackBatch.failures,
        duplicates: fallbackBatch.duplicates,
        storageRejected: cache.rejectedRecords
      }
    });
    return true;
  }

  return false;
};

const serveStatic = (url, response) => {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/system/resources") {
      rememberApiRequest(request, url);
    }

    const handled = url.pathname.startsWith("/api/") ? await handleApi(request, url, response) : false;
    if (!handled && url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { message: "Nexus API route not found." });
      return;
    }

    if (!handled) {
      serveStatic(url, response);
    }
  } catch (error) {
    sendJson(response, 500, { message: error.message || "Nexus server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Nexus local server running on http://0.0.0.0:${port}`);
  console.log(`Google redirect URI: ${config.redirectUri}`);
});

function loadEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ||= value;
  }
}
