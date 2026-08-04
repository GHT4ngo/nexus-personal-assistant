const MODEL_VERSION = "nexus-deterministic-message-signals/1";
const REPLY_REQUEST =
  /\b(could you|can you|would you|please confirm|please let me know|please call|reply(?:\s+to)?|let me know)\b/i;
const NO_REPLY =
  /\b(no reply (?:is )?(?:needed|required)|do not reply|no action (?:is )?(?:needed|required|requested))\b/i;
const ROLE_SENDER = /\b(no-?reply|billing|security|tickets?|reminder|news|offers?)@/i;
const STRONG_AUTOMATED_SENDER = /\bno-?reply@/i;
const TRANSACTIONAL_CONTENT =
  /\b(invoice|sign-in (?:was )?detected|booking itinerary|appointment reminder|weekly digest|unsubscribe|sale)\b/i;

const sourceText = (record) => {
  const title = record?.subject || record?.title || "";
  const body = record?.text || record?.body || "";
  return `${title}\n${body}`.trim();
};

const evidenceSentence = (text, match) => {
  if (!match) {
    return "";
  }
  const start = Math.max(
    text.lastIndexOf(".", match.index - 1),
    text.lastIndexOf("!", match.index - 1),
    text.lastIndexOf("?", match.index - 1),
    text.lastIndexOf("\n", match.index - 1)
  ) + 1;
  const endings = [".", "!", "?", "\n"]
    .map((separator) => text.indexOf(separator, match.index + match[0].length))
    .filter((index) => index >= 0);
  const end = endings.length ? Math.min(...endings) + 1 : text.length;
  return text.slice(start, end).trim();
};

export const classifyDeterministicMessageSignals = (record) => {
  const text = sourceText(record);
  const from = record?.from || "";
  const noReplyMatch = text.match(NO_REPLY);
  const replyMatch = noReplyMatch ? null : text.match(REPLY_REQUEST);
  const uncertainQuestion = !noReplyMatch && !replyMatch && text.includes("?");
  const listHeader = Boolean(
    record?.hasListUnsubscribe || record?.headers?.listUnsubscribe
  );
  const strongAutomatedSender = from.match(STRONG_AUTOMATED_SENDER);
  const roleSender = from.match(ROLE_SENDER);
  const transactionalMatch = text.match(TRANSACTIONAL_CONTENT);
  const automated = listHeader
    || Boolean(strongAutomatedSender)
    || Boolean(roleSender && transactionalMatch);
  const uncertainAutomated = !automated && Boolean(roleSender);

  const suggestions = {
    needsReply: uncertainQuestion ? null : Boolean(replyMatch),
    automated: uncertainAutomated ? null : automated
  };
  const evidence = {
    needsReply: replyMatch ? [evidenceSentence(text, replyMatch)] : [],
    automated: [
      ...(listHeader ? ["List-Unsubscribe header present"] : []),
      ...(strongAutomatedSender ? [strongAutomatedSender[0]] : []),
      ...(roleSender && transactionalMatch
        ? [roleSender[0], evidenceSentence(text, transactionalMatch)]
        : [])
    ]
  };
  const confidence = {
    needsReply: replyMatch ? 0.95 : noReplyMatch ? 0.98 : uncertainQuestion ? 0 : 0.9,
    automated: automated ? 0.97 : uncertainAutomated ? 0 : 0.88
  };

  return {
    suggestions,
    confidence,
    evidence,
    abstained: Object.entries(suggestions)
      .filter(([, value]) => value === null)
      .map(([label]) => label),
    modelVersion: MODEL_VERSION
  };
};
