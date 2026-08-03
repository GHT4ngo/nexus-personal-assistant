import {
  createCalendarEventRecord,
  createMessageRecord
} from "../../../src/domain/records.js";

const messageText = (message) => message.bodyPreview || message.snippet || "";
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export const normalizeGmailMessage = (message, options = {}) => createMessageRecord({
  source: "gmail",
  sourceId: message.id,
  title: message.subject || "Untitled message",
  text: messageText(message),
  sourceUrl: message.gmailUrl || null,
  receivedAt: message.date,
  from: message.from,
  attachmentNames: message.attachmentNames || [],
  normalizedAt: options.normalizedAt,
  processingVersion: options.processingVersion,
  retentionExpiresAt: options.retentionExpiresAt
});

export const normalizeGoogleCalendarEvent = (event, options = {}) => createCalendarEventRecord({
  source: "google-calendar",
  sourceId: event.id,
  title: event.title || event.summary || "Untitled event",
  text: event.description || "",
  sourceUrl: event.htmlLink || null,
  startAt: event.start,
  endAt: event.end || null,
  location: event.location || "",
  allDay: isDateOnly(event.start),
  normalizedAt: options.normalizedAt,
  processingVersion: options.processingVersion,
  retentionExpiresAt: options.retentionExpiresAt
});
