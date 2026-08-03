import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus, freemem, loadavg, totalmem, uptime } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

import {
  batchSummary,
  normalizeGoogleBatch
} from "./connectors/google/batch.js";
import { createGoogleClient } from "./connectors/google/client.js";
import {
  normalizeGmailMessage,
  normalizeGoogleCalendarEvent
} from "./connectors/google/normalize.js";
import {
  fetchGmailMessages,
  fetchGoogleCalendarEvents
} from "./connectors/google/providers.js";
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
let postalMimeLoadAttempt = null;
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

const googleFetch = googleClient.fetchJson;

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

const loadPostalMime = async () => {
  postalMimeLoadAttempt ||= import("postal-mime")
    .then((module) => module.default || module.PostalMime || module)
    .catch(() => null);
  return postalMimeLoadAttempt;
};

const parseWithPostalMime = async (rawBuffer) => {
  const PostalMime = await loadPostalMime();
  if (!PostalMime) {
    return null;
  }

  try {
    const parsed = await PostalMime.parse(rawBuffer);
    const fromAddress = parsed.from
      ? [parsed.from.name, parsed.from.address ? `<${parsed.from.address}>` : ""].filter(Boolean).join(" ")
      : "";

    return {
      from: fromAddress,
      subject: parsed.subject || "",
      text: readableText(parsed.text || decodeHtmlText(parsed.html || "")),
      attachmentNames: (parsed.attachments || []).map((attachment) => attachment.filename).filter(Boolean),
      parser: "postal-mime",
      parserError: ""
    };
  } catch (error) {
    return {
      from: "",
      subject: "",
      text: "",
      attachmentNames: [],
      parser: "postal-mime-error",
      parserError: error.message || "Postal MIME parser failed."
    };
  }
};

const decodeBase64Url = (value = "") => {
  const buffer = decodeBase64UrlBuffer(value);
  return decodeTextBuffer(buffer);
};

const decodeBase64UrlBinary = (value = "") => decodeBase64UrlBuffer(value).toString("latin1");

const decodeBase64UrlBuffer = (value = "") => {
  if (!value) {
    return Buffer.from("");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

const decodeTextBuffer = (buffer, charset = "utf-8") => {
  const normalized = charset.toLowerCase().replace(/["']/g, "").trim() || "utf-8";
  const aliases = {
    "utf8": "utf-8",
    "iso-8859-1": "windows-1252",
    "latin1": "windows-1252",
    "us-ascii": "utf-8"
  };

  try {
    return new TextDecoder(aliases[normalized] || normalized).decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
};

const decodeMimeHeader = (value = "") =>
  value.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_match, charset, encoding, text) => {
    if (encoding.toUpperCase() === "B") {
      return decodeTextBuffer(Buffer.from(text, "base64"), charset);
    }

    return decodeQuotedPrintable(text.replace(/_/g, " "), charset);
  });

const decodeQuotedPrintable = (value = "", charset = "utf-8") => {
  const cleaned = value.replace(/=\r?\n/g, "");
  const bytes = [];

  for (let index = 0; index < cleaned.length; index += 1) {
    if (cleaned[index] === "=" && /^[A-F0-9]{2}$/i.test(cleaned.slice(index + 1, index + 3))) {
      bytes.push(parseInt(cleaned.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    const char = cleaned[index];
    if (char.charCodeAt(0) <= 0x7f) {
      bytes.push(char.charCodeAt(0));
    } else {
      bytes.push(...Buffer.from(char, "utf8"));
    }
  }

  return decodeTextBuffer(Buffer.from(bytes), charset);
};

const readableText = (value = "") => compactText(decodeQuotedPrintable(value).replace(/[\u200B-\u200D\uFEFF]/g, " "));

const getPartHeader = (part, name) =>
  (part?.headers || []).find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";

const getCharset = (headerValue = "") => headerValue.match(/charset="?([^";\s]+)/i)?.[1] || "utf-8";

const decodePartBody = (part) => {
  const charset = getCharset(getPartHeader(part, "Content-Type"));
  return decodeTextBuffer(decodeBase64UrlBuffer(part?.body?.data || ""), charset);
};

const findMessageText = (part) => {
  if (!part) {
    return "";
  }

  const childParts = part.parts || [];
  const plainChild = childParts.find((child) => child.mimeType === "text/plain" && child.body?.data);
  if (plainChild) {
    return readableText(decodePartBody(plainChild));
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    return readableText(decodePartBody(part));
  }

  for (const child of childParts) {
    const text = findMessageText(child);
    if (text) {
      return text;
    }
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return readableText(decodeHtmlText(decodePartBody(part)));
  }

  if (/^(text\/|application\/(json|ld\+json|xml)|message\/)/i.test(part.mimeType || "") && part.body?.data) {
    return readableText(decodeHtmlText(decodePartBody(part)));
  }

  return "";
};

const compactText = (value = "") => value.replace(/\s+/g, " ").trim();

const collectAttachmentNames = (part, names = []) => {
  if (!part) {
    return names;
  }

  if (part.filename) {
    names.push(part.filename);
  }

  for (const child of part.parts || []) {
    collectAttachmentNames(child, names);
  }

  return names;
};

const decodeRawBodyPart = (content, transferEncoding, charset) => {
  const cleaned = content.trim();
  if (/base64/i.test(transferEncoding || "")) {
    return decodeTextBuffer(decodeBase64UrlBuffer(cleaned.replace(/\s+/g, "")), charset);
  }

  if (/quoted-printable/i.test(transferEncoding || "")) {
    return decodeQuotedPrintable(cleaned, charset);
  }

  return decodeTextBuffer(Buffer.from(cleaned, "binary"), charset);
};

const extractRawMessageText = (rawMessage = "") => {
  const parsed = parseRawMimePart(rawMessage);
  const candidates = collectRawTextCandidates(parsed);
  const plain = candidates.filter((candidate) => candidate.type.includes("text/plain")).sort((a, b) => b.text.length - a.text.length)[0];
  const html = candidates.filter((candidate) => candidate.type.includes("text/html")).sort((a, b) => b.text.length - a.text.length)[0];
  const other = candidates.sort((a, b) => b.text.length - a.text.length)[0];
  return plain?.text || html?.text || other?.text || "";
};

const parseRawHeaders = (headerText = "") => {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  return unfolded.split(/\r?\n/).reduce((result, line) => {
    const index = line.indexOf(":");
    if (index > 0) {
      const name = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      result[name] = result[name] ? `${result[name]}, ${value}` : value;
    }
    return result;
  }, {});
};

const parseContentType = (value = "text/plain") => {
  const [type, ...params] = value.split(";");
  return {
    type: type.trim().toLowerCase() || "text/plain",
    params: params.reduce((result, param) => {
      const [key, ...rest] = param.split("=");
      if (key && rest.length) {
        result[key.trim().toLowerCase()] = rest.join("=").trim().replace(/^"|"$/g, "");
      }
      return result;
    }, {})
  };
};

const parseRawMimePart = (rawPart = "") => {
  const sections = rawPart.split(/\r?\n\r?\n/);
  const headerText = sections.shift() || "";
  const body = sections.join("\n\n");
  const headers = parseRawHeaders(headerText);
  const contentType = parseContentType(headers["content-type"]);

  if (contentType.type.startsWith("multipart/") && contentType.params.boundary) {
    const boundary = contentType.params.boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = body
      .split(new RegExp(`\\r?\\n?--${boundary}(?:--)?\\r?\\n?`))
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("--"));
    return {
      headers,
      contentType,
      body: "",
      parts: parts.map(parseRawMimePart)
    };
  }

  return {
    headers,
    contentType,
    body,
    parts: []
  };
};

const collectRawTextCandidates = (part, candidates = []) => {
  if (!part) {
    return candidates;
  }

  if (/^(text\/plain|text\/html|application\/json|application\/xml|application\/ld\+json)/i.test(part.contentType.type)) {
    const decoded = decodeRawBodyPart(
      part.body,
      part.headers["content-transfer-encoding"] || "",
      part.contentType.params.charset || "utf-8"
    );
    const text = readableText(part.contentType.type === "text/html" ? decodeHtmlText(decoded) : decoded);
    if (text) {
      candidates.push({ type: part.contentType.type, text });
    }
  }

  for (const child of part.parts || []) {
    collectRawTextCandidates(child, candidates);
  }

  return candidates;
};

const extractRawHeader = (rawMessage = "", name) => {
  const headerText = rawMessage.split(/\r?\n\r?\n/)[0] || "";
  return decodeMimeHeader(parseRawHeaders(headerText)[name.toLowerCase()] || "");
};

const decodeHtmlText = (value = "") =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x([A-F0-9]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(parseInt(number, 10)));

const stripHtmlText = (value = "") => decodeHtmlText(decodeHtmlText(value));

const displayNameFromSender = (value = "") => {
  const withoutEmail = value.replace(/<[^>]+>/g, "").replace(/["']/g, "").trim();
  return withoutEmail || value.split("@")[0] || "Unknown sender";
};

const extractDomain = (value = "") => {
  const match = value.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match ? match[1].toLowerCase() : "";
};

const inferSubject = ({ from = "", bodyPreview = "", attachmentNames = [] }) => {
  const text = stripHtmlText(bodyPreview);
  const sender = displayNameFromSender(from);
  const orderNumber = text.match(/(?:ordernummer|order number|order|bestallning|best.llning)[:\s#-]*([A-Z0-9-]{4,})/i)?.[1];
  if (orderNumber) {
    return `${sender} - Order ${orderNumber}`;
  }

  const bookingNumber = text.match(/(?:bokning|booking|reservation)[:\s#-]*([A-Z0-9-]{4,})/i)?.[1];
  if (bookingNumber) {
    return `${sender} - Booking ${bookingNumber}`;
  }

  if (attachmentNames.length) {
    return `${sender} - Attachment`;
  }

  const firstReadableLine = text
    .split(/[.!?]\s+|\r?\n/)
    .map((line) => compactText(line))
    .find((line) => line.length >= 12 && !/^https?:\/\//i.test(line));

  return firstReadableLine ? `${sender} - ${firstReadableLine.slice(0, 80)}` : "(No subject)";
};

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

  if (url.pathname === "/api/google/status") {
    sendJson(response, 200, {
      configured: googleClient.isConfigured(),
      connected: Boolean(readToken()?.refresh_token),
      redirectUri: config.redirectUri,
      scopes: googleScopes
    });
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
      sendText(response, 400, "<h1>Nexus Google connection failed</h1><p>Missing authorization code or credentials.</p>");
      return true;
    }

    const result = await googleClient.exchangeAuthorizationCode(code);
    if (!result.ok) {
      sendText(response, 400, `<h1>Nexus Google connection failed</h1><pre>${escapeHtml(JSON.stringify(result.data, null, 2))}</pre>`);
      return true;
    }

    sendText(response, 200, "<h1>Google connected to Nexus</h1><p>You can close this tab and return to Nexus.</p>");
    return true;
  }

  if (url.pathname === "/api/google/calendar") {
    const result = await fetchGoogleCalendarEvents({ googleFetch });
    if (result.status >= 400) {
      sendJson(response, result.status, result.data);
      return true;
    }

    const items = result.items;
    const normalizedAt = new Date().toISOString();
    const normalized = normalizeGoogleBatch(items, normalizeGoogleCalendarEvent, { normalizedAt });

    sendJson(response, 200, {
      items,
      records: normalized.records,
      normalization: {
        ...batchSummary(normalized, items.length),
        failures: normalized.failures,
        duplicates: normalized.duplicates
      }
    });
    return true;
  }

  if (url.pathname === "/api/google/gmail") {
    const startedAt = Date.now();
    const requestedLimit = Number(url.searchParams.get("limit") || 10);
    const pageToken = url.searchParams.get("pageToken");
    const window = url.searchParams.get("window") || "14d";
    const gmailResult = await fetchGmailMessages({
      googleFetch,
      requestedLimit,
      fetchLimit: mailFetchLimit,
      pageToken,
      window,
      concurrency: mailParseConcurrency,
      mapMessage: async (message) => {
        const rawDetail = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=raw`);
        const rawBuffer = rawDetail.status < 400 ? decodeBase64UrlBuffer(rawDetail.data.raw || "") : Buffer.from("");
        const parsedMail = rawBuffer.length ? await parseWithPostalMime(rawBuffer) : null;
        const rawError = rawDetail.status >= 400
          ? rawDetail.data.error?.message || rawDetail.data.message || `Gmail raw read failed with status ${rawDetail.status}`
          : "";
        const rawMessage = rawBuffer.length ? rawBuffer.toString("latin1") : "";
        const rawText = parsedMail?.text || (rawMessage ? extractRawMessageText(rawMessage) : "");
        const rawSubject = parsedMail?.subject || (rawMessage ? extractRawHeader(rawMessage, "Subject") : "");
        const rawFrom = parsedMail?.from || (rawMessage ? extractRawHeader(rawMessage, "From") : "");
        const parsedAttachmentNames = parsedMail?.attachmentNames || [];
        let fallbackDetail = null;

        if (!rawSubject || !rawFrom || !rawText) {
          fallbackDetail = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`);
        }

        const headers = fallbackDetail?.data?.payload?.headers || [];
        const header = (name) => decodeMimeHeader(headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "");
        const attachmentNames = fallbackDetail?.data?.payload ? collectAttachmentNames(fallbackDetail.data.payload) : [];
        const fallbackText = fallbackDetail?.data?.payload ? readableText(findMessageText(fallbackDetail.data.payload)) : "";
        const fallbackSnippet = readableText(fallbackDetail?.data?.snippet || "");
        let bodyPreview = readableText(rawText || fallbackText);
        let snippet = readableText(rawText || fallbackSnippet || fallbackText);

        bodyPreview = stripHtmlText(bodyPreview).slice(0, 320);
        snippet = snippet.slice(0, 320);
        const allAttachmentNames = [...new Set([...attachmentNames, ...parsedAttachmentNames])];
        const attachmentHint = allAttachmentNames.length ? `Attachments: ${allAttachmentNames.slice(0, 3).join(", ")}` : "";

        const subject = rawSubject || header("Subject");
        const from = rawFrom || header("From");

        return {
          id: message.id,
          from,
          subject: subject || inferSubject({ from, bodyPreview, attachmentNames: allAttachmentNames }),
          isSubjectInferred: !subject,
          date: header("Date") || extractRawHeader(rawMessage, "Date"),
          snippet: stripHtmlText(snippet || attachmentHint || "No readable text found."),
          bodyPreview,
          attachmentNames: allAttachmentNames,
          isBlank: !snippet && !attachmentHint,
          gmailUrl: `https://mail.google.com/mail/u/0/#all/${message.id}`,
          parser: parsedMail?.parser || (rawError ? "raw-unavailable" : "fallback"),
          parserError: parsedMail?.parserError || rawError,
          source: "gmail"
        };
      }
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

    const messages = gmailResult.messages;
    const normalizedAt = new Date().toISOString();
    const normalized = normalizeGoogleBatch(messages, normalizeGmailMessage, { normalizedAt });

    sendJson(response, 200, {
      items: messages,
      records: normalized.records,
      normalization: {
        ...batchSummary(normalized, messages.length),
        failures: normalized.failures,
        duplicates: normalized.duplicates
      },
      nextPageToken: gmailResult.nextPageToken
    });
    rememberResourceEvent({
      type: "gmail.batch.complete",
      requestedLimit,
      maxResults: gmailResult.maxResults,
      returned: messages.length,
      durationMs: Date.now() - startedAt
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

  if (url.pathname === "/api/debug/gmail-first-400") {
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

      const listResult = await googleFetch(listUrl);
      if (listResult.status >= 400) {
        sendJson(response, listResult.status, listResult.data);
        return true;
      }

      allMessages.push(...(listResult.data.messages || []));
      nextPageToken = listResult.data.nextPageToken || "";
      if (!nextPageToken) {
        break;
      }
    }

    const parserCounts = {};
    const blankSamples = [];
    const inspected = await mapWithConcurrency(allMessages, 8, async (message) => {
      const rawDetail = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=raw`);
      const rawBuffer = rawDetail.status < 400 ? decodeBase64UrlBuffer(rawDetail.data.raw || "") : Buffer.from("");
      const parsedMail = rawBuffer.length ? await parseWithPostalMime(rawBuffer) : null;
      const parser = parsedMail?.parser || (rawDetail.status >= 400 ? "raw-unavailable" : "fallback");
      const parserError = parsedMail?.parserError || (rawDetail.status >= 400 ? rawDetail.data.error?.message || rawDetail.data.message || "" : "");
      const subject = parsedMail?.subject || "";
      const text = parsedMail?.text || "";
      const from = parsedMail?.from || "";
      const isBlank = !subject && !text;

      parserCounts[parser] = (parserCounts[parser] || 0) + 1;
      if (isBlank && blankSamples.length < 25) {
        blankSamples.push({
          id: message.id,
          parser,
          parserError,
          fromDomain: extractDomain(from),
          hasSubject: Boolean(subject),
          textLength: text.length
        });
      }

      return { parser, isBlank };
    });

    sendJson(response, 200, {
      total: inspected.length,
      blank: inspected.filter((item) => item.isBlank).length,
      parserCounts,
      blankSamples
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[char];
  });
}
