import PostalMime from "postal-mime";

const decodeBase64UrlBuffer = (value = "") => {
  if (!value) {
    return Buffer.from("");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
};

const decodeTextBuffer = (buffer, charset = "utf-8") => {
  const normalized = charset.toLowerCase().replace(/["']/g, "").trim() || "utf-8";
  const aliases = {
    utf8: "utf-8",
    "iso-8859-1": "windows-1252",
    latin1: "windows-1252",
    "us-ascii": "utf-8"
  };
  try {
    return new TextDecoder(aliases[normalized] || normalized).decode(buffer);
  } catch {
    return buffer.toString("utf8");
  }
};

const decodeQuotedPrintable = (value = "", charset = "utf-8") => {
  const cleaned = value.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let index = 0; index < cleaned.length; index += 1) {
    if (cleaned[index] === "=" && /^[A-F0-9]{2}$/i.test(cleaned.slice(index + 1, index + 3))) {
      bytes.push(parseInt(cleaned.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      const character = cleaned[index];
      bytes.push(...(character.charCodeAt(0) <= 0x7f
        ? [character.charCodeAt(0)]
        : Buffer.from(character, "utf8")));
    }
  }
  return decodeTextBuffer(Buffer.from(bytes), charset);
};

const decodeMimeHeader = (value = "") =>
  value.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_match, charset, encoding, text) =>
    encoding.toUpperCase() === "B"
      ? decodeTextBuffer(Buffer.from(text, "base64"), charset)
      : decodeQuotedPrintable(text.replace(/_/g, " "), charset));

const compactText = (value = "") => String(value).replace(/\s+/g, " ").trim();
const readableText = (value = "") =>
  compactText(decodeQuotedPrintable(value).replace(/[\u200B-\u200D\uFEFF]/g, " "));

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
const getPartHeader = (part, name) =>
  (part?.headers || []).find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
const getCharset = (value = "") => value.match(/charset="?([^";\s]+)/i)?.[1] || "utf-8";
const decodePartBody = (part) =>
  decodeTextBuffer(
    decodeBase64UrlBuffer(part?.body?.data || ""),
    getCharset(getPartHeader(part, "Content-Type"))
  );

const findMessageText = (part) => {
  if (!part) {
    return "";
  }
  const children = part.parts || [];
  const plain = children.find((child) => child.mimeType === "text/plain" && child.body?.data);
  if (plain) {
    return readableText(decodePartBody(plain));
  }
  if (part.mimeType === "text/plain" && part.body?.data) {
    return readableText(decodePartBody(part));
  }
  for (const child of children) {
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

const parseRawHeaders = (headerText = "") =>
  headerText
    .replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/)
    .reduce((headers, line) => {
      const separator = line.indexOf(":");
      if (separator > 0) {
        const name = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
      }
      return headers;
    }, {});

const extractRawHeader = (rawMessage, name) =>
  decodeMimeHeader(parseRawHeaders(rawMessage.split(/\r?\n\r?\n/)[0] || "")[name.toLowerCase()] || "");

const displayNameFromSender = (value = "") =>
  value.replace(/<[^>]+>/g, "").replace(/["']/g, "").trim() || value.split("@")[0] || "Unknown sender";

const inferSubject = ({ from = "", bodyPreview = "", attachmentNames = [] }) => {
  const sender = displayNameFromSender(from);
  const text = stripHtmlText(bodyPreview);
  const orderNumber = text.match(
    /(?:ordernummer|order number|order|bestallning|best.llning)[:\s#-]*([A-Z0-9-]{4,})/i
  )?.[1];
  if (orderNumber) {
    return `${sender} - Order ${orderNumber}`;
  }
  const bookingNumber = text.match(
    /(?:bokning|booking|reservation)[:\s#-]*([A-Z0-9-]{4,})/i
  )?.[1];
  if (bookingNumber) {
    return `${sender} - Booking ${bookingNumber}`;
  }
  if (attachmentNames.length) {
    return `${sender} - Attachment`;
  }
  const firstLine = text
    .split(/[.!?]\s+|\r?\n/)
    .map(compactText)
    .find((line) => line.length >= 12 && !/^https?:\/\//i.test(line));
  return firstLine ? `${sender} - ${firstLine.slice(0, 80)}` : "(No subject)";
};

const extractDomain = (value = "") =>
  value.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1]?.toLowerCase() || "";

export const createGmailMessageParser = ({
  googleFetch,
  postalMimeParse = (rawBuffer) => PostalMime.parse(rawBuffer)
}) => {
  const parsePostalMime = async (rawBuffer) => {
    try {
      const parsed = await postalMimeParse(rawBuffer);
      return {
        from: parsed.from
          ? [parsed.from.name, parsed.from.address ? `<${parsed.from.address}>` : ""]
            .filter(Boolean)
            .join(" ")
          : "",
        subject: parsed.subject || "",
        text: readableText(parsed.text || decodeHtmlText(parsed.html || "")),
        attachmentNames: (parsed.attachments || []).map((item) => item.filename).filter(Boolean),
        parser: "postal-mime",
        parserError: ""
      };
    } catch {
      return {
        from: "",
        subject: "",
        text: "",
        attachmentNames: [],
        parser: "postal-mime-error",
        parserError: "Postal MIME parser failed."
      };
    }
  };

  const fetchRaw = async (id) => {
    const result = await googleFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`
    );
    const buffer = result.status < 400
      ? decodeBase64UrlBuffer(result.data.raw || "")
      : Buffer.from("");
    return { result, buffer, parsed: buffer.length ? await parsePostalMime(buffer) : null };
  };

  const parseMessage = async (message) => {
    const raw = await fetchRaw(message.id);
    const rawError = raw.result.status >= 400
      ? raw.result.data.error?.message
        || raw.result.data.message
        || `Gmail raw read failed with status ${raw.result.status}`
      : "";
    const rawMessage = raw.buffer.length ? raw.buffer.toString("latin1") : "";
    const parsed = raw.parsed;
    let fallback = null;

    if (!parsed?.subject || !parsed?.from || !parsed?.text) {
      fallback = await googleFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`
      );
    }

    const headers = fallback?.data?.payload?.headers || [];
    const header = (name) =>
      decodeMimeHeader(headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "");
    const fallbackAttachments = fallback?.data?.payload
      ? collectAttachmentNames(fallback.data.payload)
      : [];
    const attachmentNames = [...new Set([
      ...fallbackAttachments,
      ...(parsed?.attachmentNames || [])
    ])];
    const fallbackText = fallback?.data?.payload ? findMessageText(fallback.data.payload) : "";
    const bodyPreview = stripHtmlText(readableText(parsed?.text || fallbackText)).slice(0, 320);
    const fallbackSnippet = readableText(fallback?.data?.snippet || "");
    const snippet = stripHtmlText(
      readableText(parsed?.text || fallbackSnippet || fallbackText)
      || (attachmentNames.length ? `Attachments: ${attachmentNames.slice(0, 3).join(", ")}` : "")
      || "No readable text found."
    ).slice(0, 320);
    const subject = parsed?.subject || header("Subject") || extractRawHeader(rawMessage, "Subject");
    const from = parsed?.from || header("From") || extractRawHeader(rawMessage, "From");

    return {
      id: message.id,
      from,
      subject: subject || inferSubject({ from, bodyPreview, attachmentNames }),
      isSubjectInferred: !subject,
      date: header("Date") || extractRawHeader(rawMessage, "Date"),
      snippet,
      bodyPreview,
      attachmentNames,
      isBlank: !bodyPreview && !attachmentNames.length,
      gmailUrl: `https://mail.google.com/mail/u/0/#all/${message.id}`,
      parser: parsed?.parser || (rawError ? "raw-unavailable" : "fallback"),
      parserError: parsed?.parserError || rawError,
      source: "gmail"
    };
  };

  const inspectRawMessage = async (message) => {
    const raw = await fetchRaw(message.id);
    const parsed = raw.parsed;
    const parserError = parsed?.parserError || (raw.result.status >= 400
      ? raw.result.data.error?.message || raw.result.data.message || ""
      : "");
    return {
      id: message.id,
      parser: parsed?.parser || (raw.result.status >= 400 ? "raw-unavailable" : "fallback"),
      parserError,
      fromDomain: extractDomain(parsed?.from || ""),
      hasSubject: Boolean(parsed?.subject),
      textLength: parsed?.text?.length || 0,
      isBlank: !parsed?.subject && !parsed?.text
    };
  };

  return { inspectRawMessage, parseMessage };
};
