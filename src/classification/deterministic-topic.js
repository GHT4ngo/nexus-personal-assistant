const MODEL_VERSION = "nexus-deterministic-topic/1";
const TOPIC_RULES = {
  study: [
    /\bassignment\b/gi,
    /\bcourse\b/gi,
    /\bstudent\b/gi,
    /\bschool\b/gi,
    /\bstudy\b/gi,
    /\bdatabase\b/gi
  ],
  work: [
    /\bproject\b/gi,
    /\breview\b/gi,
    /\breport\b/gi,
    /\bdraft\b/gi,
    /\bcolleague\b/gi,
    /\bmanager\b/gi,
    /\bprofessional\b/gi
  ],
  finance: [
    /\binvoice\b/gi,
    /\bpayment\b/gi,
    /\bpaid\b/gi,
    /\breceipt\b/gi,
    /\bpurchase\b/gi,
    /\bbilling\b/gi,
    /\b(?:eur|usd|sek)\b/gi
  ],
  travel: [
    /\btrain\b/gi,
    /\bbooking\b/gi,
    /\bitinerary\b/gi,
    /\btrip\b/gi,
    /\bdeparts?\b/gi,
    /\barrives?\b/gi,
    /\breservation\b/gi
  ],
  health: [
    /\bappointment\b/gi,
    /\bclinic\b/gi,
    /\bhealth\b/gi,
    /\bmedical\b/gi,
    /\bmedication\b/gi,
    /\bcare\b/gi
  ],
  personal: [
    /\bdinner\b/gi,
    /\blunch\b/gi,
    /\bfamily\b/gi,
    /\bfriend\b/gi,
    /\bhousemate\b/gi,
    /\bapartment\b/gi,
    /\bsocial\b/gi
  ],
  other: [
    /\bnewsletter\b/gi,
    /\bdigest\b/gi,
    /\bsecurity alert\b/gi,
    /\bsale\b/gi,
    /\bdiscount\b/gi,
    /\boffer\b/gi,
    /\bpublication\b/gi,
    /\bfaq\b/gi,
    /\bcommunity update\b/gi,
    /\badministrative\b/gi
  ]
};

const sourceText = (record) => {
  const title = record?.subject || record?.title || "";
  const body = record?.text || record?.body || "";
  return `${title}\n${body}`.trim();
};

const scoreTopic = (text, patterns) => {
  const evidence = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      evidence.push(match[0]);
    }
  }
  return { score: evidence.length, evidence: [...new Set(evidence)] };
};

export const classifyDeterministicTopic = (record) => {
  const text = sourceText(record);
  const scores = Object.entries(TOPIC_RULES)
    .map(([topic, patterns]) => ({ topic, ...scoreTopic(text, patterns) }))
    .sort((left, right) => right.score - left.score || left.topic.localeCompare(right.topic));
  const strongest = scores[0];
  const tied = strongest.score > 0 && scores[1]?.score === strongest.score;
  const topic = strongest.score > 0 && !tied ? strongest.topic : null;

  return {
    suggestions: { topic },
    confidence: { topic: topic ? (strongest.score >= 2 ? 0.94 : 0.82) : 0 },
    evidence: { topic: topic ? strongest.evidence : [] },
    abstained: topic ? [] : ["topic"],
    scores: Object.fromEntries(scores.map((item) => [item.topic, item.score])),
    modelVersion: MODEL_VERSION
  };
};
