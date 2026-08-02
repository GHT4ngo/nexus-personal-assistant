import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import PostalMime from "postal-mime";

const root = resolve(process.cwd());
const defaultMboxPath = join(root, "takeout-20260507T182903Z-3-001", "Takeout", "Mail", "All mail Including Spam and Trash.mbox");
const mboxPath = process.argv[2] ? resolve(process.argv[2]) : defaultMboxPath;
const reportPath = join(root, "data", "private", "mail-diagnostics.json");
const targetTerms = [
  "alphaspel",
  "ngrok",
  "wizardsofthecoast",
  "wizards of the coast",
  "linkedin",
  "cardmarket"
];

if (!existsSync(mboxPath)) {
  console.error(`MBOX not found: ${mboxPath}`);
  process.exit(1);
}

const report = {
  mboxPath,
  scannedAt: new Date().toISOString(),
  totalMessages: 0,
  parsedMessages: 0,
  blankMessages: 0,
  first400: {
    parsedMessages: 0,
    blankMessages: 0,
    parserErrors: 0,
    missingSubject: 0,
    missingText: 0,
    targetMessages: {}
  },
  targetMessages: {},
  parserErrors: 0,
  samples: []
};

for (const term of targetTerms) {
  report.first400.targetMessages[term] = {
    total: 0,
    blank: 0,
    parserErrors: 0,
    missingSubject: 0,
    missingText: 0
  };
  report.targetMessages[term] = {
    total: 0,
    blank: 0,
    parserErrors: 0,
    missingSubject: 0,
    missingText: 0
  };
}

let carry = Buffer.from("");

const handleMessage = async (rawMessage) => {
  if (!rawMessage.length) {
    return;
  }

  report.totalMessages += 1;
  const lower = rawMessage.toString("latin1").toLowerCase();
  const matchingTerms = targetTerms.filter((term) => lower.includes(term));
  const inFirst400 = report.totalMessages <= 400;
  const shouldSample = matchingTerms.length > 0 || inFirst400;

  if (!shouldSample && report.totalMessages % 500 !== 0) {
    return;
  }

  try {
    const parsed = await PostalMime.parse(rawMessage);
    const subject = parsed.subject || "";
    const from = formatAddress(parsed.from);
    const text = compactText(parsed.text || stripHtml(parsed.html || ""));
    const blank = !subject && !text;

    report.parsedMessages += 1;
    if (blank) {
      report.blankMessages += 1;
    }

    if (inFirst400) {
      report.first400.parsedMessages += 1;
      report.first400.blankMessages += blank ? 1 : 0;
      report.first400.missingSubject += subject ? 0 : 1;
      report.first400.missingText += text ? 0 : 1;
    }

    for (const term of matchingTerms) {
      const bucket = report.targetMessages[term];
      bucket.total += 1;
      bucket.blank += blank ? 1 : 0;
      bucket.missingSubject += subject ? 0 : 1;
      bucket.missingText += text ? 0 : 1;

      if (inFirst400) {
        const first400Bucket = report.first400.targetMessages[term];
        first400Bucket.total += 1;
        first400Bucket.blank += blank ? 1 : 0;
        first400Bucket.missingSubject += subject ? 0 : 1;
        first400Bucket.missingText += text ? 0 : 1;
      }
    }

    if (shouldSample && report.samples.length < 100) {
      report.samples.push({
        terms: matchingTerms,
        fromDomain: extractDomain(from),
        hasSubject: Boolean(subject),
        textLength: text.length,
        blank,
        attachments: (parsed.attachments || []).length
      });
    }
  } catch (error) {
    report.parserErrors += 1;
    if (inFirst400) {
      report.first400.parserErrors += 1;
    }
    for (const term of matchingTerms) {
      report.targetMessages[term].parserErrors += 1;
      if (inFirst400) {
        report.first400.targetMessages[term].parserErrors += 1;
      }
    }
  }
};

const processChunk = async (chunk) => {
  let buffer = Buffer.concat([carry, chunk]);
  let start = 0;

  while (true) {
    const next = buffer.indexOf("\nFrom ", start + 1, "latin1");
    if (next === -1) {
      carry = buffer.subarray(start);
      return;
    }

    await handleMessage(stripMboxEnvelope(buffer.subarray(start, next)));
    start = next + 1;
  }
};

for await (const chunk of createReadStream(mboxPath, { highWaterMark: 1024 * 1024 })) {
  await processChunk(chunk);
}

await handleMessage(stripMboxEnvelope(carry));

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  totalMessages: report.totalMessages,
  parsedMessages: report.parsedMessages,
  blankMessages: report.blankMessages,
  first400: report.first400,
  parserErrors: report.parserErrors,
  targetMessages: report.targetMessages,
  reportPath
}, null, 2));

function stripMboxEnvelope(buffer) {
  const firstNewline = buffer.indexOf("\n");
  if (buffer.subarray(0, 5).toString("latin1") === "From " && firstNewline !== -1) {
    return buffer.subarray(firstNewline + 1);
  }

  return buffer;
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
