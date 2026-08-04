const MODEL_VERSION = "nexus-deterministic-dates/1";
const ISO_DATE_TIME =
  /\b20\d{2}-\d{2}-\d{2}(?:\s+(?:at\s+)?\d{1,2}:\d{2})?\b/gi;
const WEEKDAY_TIME =
  /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2}):(\d{2})\b/gi;
const DATE_LIKE = /\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const DEADLINE_CONTEXT = /\b(due(?:\s+on)?|deadline(?:\s+is)?|must be paid by|send\b.{0,60}\bby)\s*$/i;
const CALENDAR_CONTEXT =
  /\b(meet|meeting|review|appointment|attend|departs?|arrives?|booking|reservation|dinner|lunch|call)\b/i;
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const validIsoDate = (evidence) => {
  const parts = evidence.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:\s+(?:at\s+)?(\d{1,2}):(\d{2}))?$/i
  );
  if (!parts) {
    return null;
  }
  const [, year, month, day, hour, minute] = parts;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const validDay = parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
  const validTime = hour === undefined
    || (Number(hour) <= 23 && Number(minute) <= 59);
  if (!validDay || !validTime) {
    return null;
  }
  return hour === undefined
    ? `${year}-${month}-${day}`
    : `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}`;
};

const nextWeekday = (receivedAt, weekday, hour, minute) => {
  const received = new Date(receivedAt);
  if (Number.isNaN(received.valueOf())) {
    return null;
  }
  const target = WEEKDAYS.indexOf(weekday.toLowerCase());
  let dayOffset = (target - received.getUTCDay() + 7) % 7;
  const occursAt = new Date(received);
  occursAt.setUTCHours(Number(hour), Number(minute), 0, 0);
  if (dayOffset === 0 && occursAt <= received) {
    dayOffset = 7;
  }
  occursAt.setUTCDate(occursAt.getUTCDate() + dayOffset);
  return [
    occursAt.getUTCFullYear(),
    String(occursAt.getUTCMonth() + 1).padStart(2, "0"),
    String(occursAt.getUTCDate()).padStart(2, "0")
  ].join("-") + `T${String(hour).padStart(2, "0")}:${minute}`;
};

const findTemporalExpressions = (text, receivedAt) => {
  const matches = [];
  for (const match of text.matchAll(ISO_DATE_TIME)) {
    const occursAt = validIsoDate(match[0]);
    if (occursAt) {
      matches.push({ evidence: match[0], index: match.index, occursAt });
    }
  }
  for (const match of text.matchAll(WEEKDAY_TIME)) {
    const occursAt = nextWeekday(receivedAt, match[1], match[2], match[3]);
    if (occursAt) {
      matches.push({ evidence: match[0], index: match.index, occursAt });
    }
  }
  return matches.sort((left, right) => left.index - right.index);
};

const evidenceWindow = (text, expression) => {
  const start = Math.max(0, expression.index - 80);
  const end = Math.min(text.length, expression.index + expression.evidence.length + 40);
  return text.slice(start, end).trim();
};

export const classifyDeterministicDates = (record) => {
  const subject = record?.subject || "";
  const body = record?.text || record?.body || "";
  const text = `${subject}\n${body}`.trim();
  const expressions = findTemporalExpressions(text, record?.receivedAt);
  const deadline = expressions.find((expression) =>
    DEADLINE_CONTEXT.test(text.slice(Math.max(0, expression.index - 80), expression.index)));
  const calendar = !deadline && expressions.find((expression) => {
    const window = evidenceWindow(text, expression);
    return expression.evidence.includes(":") && CALENDAR_CONTEXT.test(window);
  });
  const unsupportedTemporalText = expressions.length === 0 && DATE_LIKE.test(text);

  const suggestions = {
    hasDeadline: deadline ? true : unsupportedTemporalText ? null : false,
    calendarCandidate: calendar ? true : unsupportedTemporalText ? null : false
  };
  const evidence = {
    hasDeadline: deadline ? [evidenceWindow(text, deadline)] : [],
    calendarCandidate: calendar ? [evidenceWindow(text, calendar)] : []
  };
  const confidence = {
    hasDeadline: deadline ? 0.96 : unsupportedTemporalText ? 0 : 0.9,
    calendarCandidate: calendar ? 0.94 : unsupportedTemporalText ? 0 : 0.88
  };
  const values = {
    hasDeadline: deadline?.occursAt || null,
    calendarCandidate: calendar?.occursAt || null
  };

  return {
    suggestions,
    values,
    confidence,
    evidence,
    abstained: Object.entries(suggestions)
      .filter(([, value]) => value === null)
      .map(([label]) => label),
    modelVersion: MODEL_VERSION
  };
};
