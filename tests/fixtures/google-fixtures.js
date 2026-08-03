export const NORMALIZED_AT = "2026-08-03T10:00:00.000Z";

export const gmailMessageFixture = {
  id: "synthetic-message-001",
  from: "Study Portal <no-reply@example.test>",
  subject: "Synthetic assignment reminder",
  date: "2026-08-03T08:30:00.000Z",
  snippet: "A synthetic assignment is due next week.",
  bodyPreview: "A synthetic assignment is due next week. No reply is required.",
  attachmentNames: ["instructions.pdf"],
  gmailUrl: "https://mail.google.com/mail/u/0/#all/synthetic-message-001",
  source: "gmail"
};

export const calendarEventFixture = {
  id: "synthetic-event-001",
  title: "Synthetic study session",
  start: "2026-08-04T14:00:00.000Z",
  end: "2026-08-04T15:30:00.000Z",
  location: "Example library",
  description: "Review synthetic fixture data.",
  htmlLink: "https://calendar.google.com/calendar/event?eid=synthetic-event-001",
  source: "google-calendar"
};
