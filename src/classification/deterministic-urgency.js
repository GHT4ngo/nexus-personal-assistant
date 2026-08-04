const MODEL_VERSION = "nexus-deterministic-urgency/1";
const IMMEDIACY =
  /\b(immediately|as soon as possible|asap|right now|needed now|urgent(?:ly)?)\b/i;
const CONCRETE_HARM =
  /\b(emergency|flooding|flood|fire|danger|fraud|stolen|medical crisis|security alert|sign-in (?:was )?detected|locked out|water leak)\b/i;
const PROMOTIONAL =
  /\b(sale|discount|offer|promotion|promotional|shop|final hours|act now)\b/i;

const sourceText = (record) => {
  const title = record?.subject || record?.title || "";
  const body = record?.text || record?.body || "";
  return `${title}\n${body}`.trim();
};

const evidenceSentence = (text, match) => {
  const previousBoundaries = [".", "!", "?", "\n"]
    .map((separator) => text.lastIndexOf(separator, match.index - 1));
  const start = Math.max(...previousBoundaries) + 1;
  const nextBoundaries = [".", "!", "?", "\n"]
    .map((separator) => text.indexOf(separator, match.index + match[0].length))
    .filter((index) => index >= 0);
  const end = nextBoundaries.length ? Math.min(...nextBoundaries) + 1 : text.length;
  return text.slice(start, end).trim();
};

export const classifyDeterministicUrgency = (record) => {
  const text = sourceText(record);
  const immediateMatch = text.match(IMMEDIACY);
  const harmMatch = text.match(CONCRETE_HARM);
  const promotional = Boolean(
    record?.hasListUnsubscribe
      || record?.headers?.listUnsubscribe
      || text.match(PROMOTIONAL)
  );
  const urgent = Boolean(immediateMatch && harmMatch && !promotional);
  const uncertainHarm = Boolean(harmMatch && !immediateMatch && !promotional);
  const suggestions = {
    urgent: uncertainHarm ? null : urgent
  };
  const evidence = urgent
    ? [...new Set([
      evidenceSentence(text, harmMatch),
      evidenceSentence(text, immediateMatch)
    ])]
    : [];

  return {
    suggestions,
    confidence: {
      urgent: urgent ? 0.97 : uncertainHarm ? 0 : promotional ? 0.98 : 0.9
    },
    evidence: { urgent: evidence },
    abstained: uncertainHarm ? ["urgent"] : [],
    modelVersion: MODEL_VERSION
  };
};
