import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import PostalMime from "postal-mime";

const root = resolve(process.cwd());
const tokenPath = join(root, "data", "private", "google-token.json");
const reportPath = join(root, "data", "private", "gmail-diagnostics.json");
const limit = Number(process.argv[2] || 400);
const targetTerms = ["alphaspel", "ngrok", "wizardsofthecoast", "wizards of the coast", "linkedin", "cardmarket"];

loadEnvFile();

if (!existsSync(tokenPath)) {
  console.error("Google token missing. Connect Google in Nexus first.");
  process.exit(1);
}

let token;
let messages;
try {
  token = await refreshAccessToken(JSON.parse(readFileSync(tokenPath, "utf8")));
  messages = await listMessages(limit);
} catch (error) {
  const blockedReport = {
    scannedAt: new Date().toISOString(),
    requestedLimit: limit,
    totalMessages: 0,
    blankMessages: 0,
    missingSubject: 0,
    missingText: 0,
    parserErrors: 0,
    networkError: error.message || "Could not reach Gmail API from this environment.",
    targetMessages: Object.fromEntries(targetTerms.map((term) => [term, { total: 0, blank: 0, missingSubject: 0, missingText: 0, parserErrors: 0 }])),
    samples: []
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(blockedReport, null, 2));
  console.log(JSON.stringify({
    networkError: blockedReport.networkError,
    reportPath
  }, null, 2));
  process.exit(0);
}
const report = {
  scannedAt: new Date().toISOString(),
  requestedLimit: limit,
  totalMessages: messages.length,
  blankMessages: 0,
  missingSubject: 0,
  missingText: 0,
  parserErrors: 0,
  targetMessages: Object.fromEntries(targetTerms.map((term) => [term, { total: 0, blank: 0, missingSubject: 0, missingText: 0, parserErrors: 0 }])),
  samples: []
};

for (const message of messages) {
  const rawResult = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=raw`);
  if (!rawResult.raw) {
    continue;
  }

  try {
    const rawBuffer = decodeBase64UrlBuffer(rawResult.raw);
    const rawLower = rawBuffer.toString("latin1").toLowerCase();
    const matchingTerms = targetTerms.filter((term) => rawLower.includes(term));
    const parsed = await PostalMime.parse(rawBuffer);
    const subject = parsed.subject || "";
    const text = compactText(parsed.text || stripHtml(parsed.html || ""));
    const blank = !subject && !text;

    report.blankMessages += blank ? 1 : 0;
    report.missingSubject += subject ? 0 : 1;
    report.missingText += text ? 0 : 1;

    for (const term of matchingTerms) {
      const bucket = report.targetMessages[term];
      bucket.total += 1;
      bucket.blank += blank ? 1 : 0;
      bucket.missingSubject += subject ? 0 : 1;
      bucket.missingText += text ? 0 : 1;
    }

    if ((blank || matchingTerms.length) && report.samples.length < 100) {
      report.samples.push({
        id: message.id,
        terms: matchingTerms,
        fromDomain: extractDomain(formatAddress(parsed.from)),
        hasSubject: Boolean(subject),
        textLength: text.length,
        blank,
        attachments: (parsed.attachments || []).length
      });
    }
  } catch (error) {
    report.parserErrors += 1;
  }
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  totalMessages: report.totalMessages,
  blankMessages: report.blankMessages,
  missingSubject: report.missingSubject,
  missingText: report.missingText,
  parserErrors: report.parserErrors,
  targetMessages: report.targetMessages,
  reportPath
}, null, 2));

async function listMessages(maxMessages) {
  const results = [];
  let pageToken = "";

  while (results.length < maxMessages) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", String(Math.min(100, maxMessages - results.length)));
    url.searchParams.set("q", "-category:promotions -in:chats");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const data = await googleFetch(url);
    results.push(...(data.messages || []));
    pageToken = data.nextPageToken || "";
    if (!pageToken) {
      break;
    }
  }

  return results;
}

async function googleFetch(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || "Google API request failed.");
  }
  return data;
}

async function refreshAccessToken(currentToken) {
  if (currentToken.expires_at && Date.now() < currentToken.expires_at - 60_000) {
    return currentToken;
  }

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: currentToken.refresh_token,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google token refresh failed.");
  }

  const nextToken = {
    ...currentToken,
    ...data,
    expires_at: Date.now() + data.expires_in * 1000
  };
  writeFileSync(tokenPath, JSON.stringify(nextToken, null, 2));
  return nextToken;
}

function decodeBase64UrlBuffer(value = "") {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function compactText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value = "") {
  return value
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
    .replace(/&#39;/gi, "'");
}

function formatAddress(address) {
  if (!address) {
    return "";
  }

  return [address.name, address.address ? `<${address.address}>` : ""].filter(Boolean).join(" ");
}

function extractDomain(value = "") {
  const match = value.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match ? match[1].toLowerCase() : "";
}

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
