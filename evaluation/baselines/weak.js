const combinedText = (message) =>
  `${message.from || ""} ${message.subject || ""} ${message.text || ""}`.toLowerCase();

const matchEvidence = (text, pattern) => text.match(pattern)?.[0] || "";

export const classifyWithWeakBaseline = (message) => {
  const text = combinedText(message);
  const replyEvidence = matchEvidence(
    text,
    /\b(could you|can you|please confirm|please let me know|call me|would you like)\b|\?/
  );
  const deadlineEvidence = matchEvidence(
    text,
    /\b(due|deadline|must be paid|send .{0,30}\bby)\b/
  );
  const dateTimeEvidence = matchEvidence(
    text,
    /\b20\d{2}-\d{2}-\d{2}\b.{0,40}\b\d{1,2}:\d{2}\b/
  );
  const urgentEvidence = matchEvidence(text, /\b(urgent|immediately|as soon as possible|asap)\b/);
  const automatedEvidence = matchEvidence(
    text,
    /\b(no-reply|unsubscribe|billing|security|tickets|reminder|offers|weekly)\b/
  );
  const topicRules = [
    ["study", /\b(assignment|study|student|course)\b/],
    ["work", /\b(project|manager|report|colleague)\b/],
    ["finance", /\b(invoice|billing|paid|eur)\b/],
    ["travel", /\b(train|booking|departs|arrives)\b/],
    ["health", /\b(clinic|appointment|health)\b/],
    ["personal", /\b(dinner|family|friend)\b/],
    ["other", /\b(newsletter|digest|security|sale|offer)\b/]
  ];
  const topicMatch = topicRules
    .map(([topic, pattern]) => [topic, matchEvidence(text, pattern)])
    .find(([, evidence]) => evidence);

  const labels = {
    needsReply: Boolean(replyEvidence),
    hasDeadline: Boolean(deadlineEvidence),
    calendarCandidate: Boolean(dateTimeEvidence) && !deadlineEvidence,
    urgent: Boolean(urgentEvidence),
    automated: Boolean(automatedEvidence),
    topic: topicMatch?.[0] || null
  };
  const evidence = {
    needsReply: replyEvidence ? [replyEvidence] : [],
    hasDeadline: deadlineEvidence ? [deadlineEvidence] : [],
    calendarCandidate: labels.calendarCandidate ? [dateTimeEvidence] : [],
    urgent: urgentEvidence ? [urgentEvidence] : [],
    automated: automatedEvidence ? [automatedEvidence] : [],
    topic: topicMatch ? [topicMatch[1]] : []
  };
  const confidence = Object.fromEntries(
    Object.entries(labels).map(([label, value]) => [label, value === null ? 0 : value ? 0.72 : 0.58])
  );

  return {
    labels,
    confidence,
    evidence,
    abstained: labels.topic === null ? ["topic"] : [],
    modelVersion: "nexus-weak-keywords/1"
  };
};
