import { BINARY_LABELS } from "./schema.js";

const divide = (numerator, denominator) => denominator ? numerator / denominator : null;
const rounded = (value) => value === null ? null : Number(value.toFixed(4));

const scoreBinaryLabel = (items, predictions, label) => {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0, abstained: 0, scorable: 0 };
  const confidenceRows = [];
  items.forEach((item, index) => {
    const expected = item.expected[label];
    if (expected === null) {
      return;
    }
    counts.scorable += 1;
    const predicted = predictions[index].labels[label];
    if (predicted === null || predicted === undefined) {
      counts.abstained += 1;
      return;
    }
    if (predicted && expected) counts.tp += 1;
    if (predicted && !expected) counts.fp += 1;
    if (!predicted && expected) counts.fn += 1;
    if (!predicted && !expected) counts.tn += 1;
    const statedConfidence = predictions[index].confidence[label];
    const trueProbability = predicted ? statedConfidence : 1 - statedConfidence;
    confidenceRows.push({
      correct: predicted === expected,
      confidence: statedConfidence,
      squaredError: (trueProbability - Number(expected)) ** 2
    });
  });

  const precision = divide(counts.tp, counts.tp + counts.fp);
  const recall = divide(counts.tp, counts.tp + counts.fn);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : (2 * precision * recall) / (precision + recall);
  return {
    ...counts,
    precision: rounded(precision),
    recall: rounded(recall),
    f1: rounded(f1),
    abstentionRate: rounded(divide(counts.abstained, counts.scorable)),
    brierScore: rounded(divide(
      confidenceRows.reduce((sum, row) => sum + row.squaredError, 0),
      confidenceRows.length
    ))
  };
};

const scoreTopic = (items, predictions) => {
  let scorable = 0;
  let predicted = 0;
  let correct = 0;
  items.forEach((item, index) => {
    if (item.expected.topic === null) {
      return;
    }
    scorable += 1;
    const value = predictions[index].labels.topic;
    if (value !== null && value !== undefined) {
      predicted += 1;
      correct += Number(value === item.expected.topic);
    }
  });
  return {
    scorable,
    predicted,
    correct,
    coverage: rounded(divide(predicted, scorable)),
    accuracy: rounded(divide(correct, predicted))
  };
};

const calibrationBuckets = (items, predictions) => {
  const buckets = [
    { name: "low", minimum: 0, maximum: 0.5999, count: 0, correct: 0, confidenceTotal: 0 },
    { name: "medium", minimum: 0.6, maximum: 0.7999, count: 0, correct: 0, confidenceTotal: 0 },
    { name: "high", minimum: 0.8, maximum: 1, count: 0, correct: 0, confidenceTotal: 0 }
  ];
  items.forEach((item, index) => {
    BINARY_LABELS.forEach((label) => {
      const expected = item.expected[label];
      const predicted = predictions[index].labels[label];
      if (expected === null || predicted === null || predicted === undefined) {
        return;
      }
      const confidence = predictions[index].confidence[label];
      const bucket = buckets.find((candidate) =>
        confidence >= candidate.minimum && confidence <= candidate.maximum);
      if (bucket) {
        bucket.count += 1;
        bucket.correct += Number(predicted === expected);
        bucket.confidenceTotal += confidence;
      }
    });
  });
  return buckets.map(({ name, count, correct, confidenceTotal }) => ({
    name,
    count,
    accuracy: rounded(divide(correct, count)),
    meanConfidence: rounded(divide(confidenceTotal, count))
  }));
};

export const evaluateClassifier = (dataset, classifier) => {
  const predictions = dataset.items.map((item) => classifier(item.message));
  const binary = Object.fromEntries(
    BINARY_LABELS.map((label) => [label, scoreBinaryLabel(dataset.items, predictions, label)])
  );
  const missingEvidence = [];
  dataset.items.forEach((item, index) => {
    for (const label of ["needsReply", "hasDeadline"]) {
      if (predictions[index].labels[label] === true
        && !predictions[index].evidence?.[label]?.length) {
        missingEvidence.push({ id: item.id, label });
      }
    }
  });
  const falseUrgentIds = dataset.items
    .filter((item, index) =>
      item.expected.urgent === false && predictions[index].labels.urgent === true)
    .map((item) => item.id);
  const missedUrgentIds = dataset.items
    .filter((item, index) =>
      item.expected.urgent === true && predictions[index].labels.urgent !== true)
    .map((item) => item.id);

  return {
    schemaVersion: 1,
    datasetId: dataset.datasetId,
    classifierVersion: predictions[0]?.modelVersion || "unknown",
    itemCount: dataset.items.length,
    metrics: {
      binary,
      topic: scoreTopic(dataset.items, predictions),
      falseUrgentIds,
      missedUrgentIds,
      evidence: {
        requiredPositivePredictions: dataset.items.reduce((count, _item, index) =>
          count + ["needsReply", "hasDeadline"].filter((label) =>
            predictions[index].labels[label] === true).length, 0),
        missing: missingEvidence
      },
      calibration: calibrationBuckets(dataset.items, predictions)
    },
    predictions: dataset.items.map((item, index) => ({
      id: item.id,
      ...predictions[index]
    }))
  };
};

export const assessQualityGates = (report, gates) => {
  const results = [];
  for (const [label, thresholds] of Object.entries(gates.binary)) {
    for (const [metric, minimum] of Object.entries(thresholds)) {
      const actual = report.metrics.binary[label][metric];
      results.push({
        gate: `${label}.${metric}`,
        expected: `>= ${minimum}`,
        actual,
        passed: actual !== null && actual >= minimum
      });
    }
  }
  for (const [label, maximum] of Object.entries(gates.maximumAbstentionRate || {})) {
    const actual = report.metrics.binary[label].abstentionRate;
    results.push({
      gate: `${label}.abstentionRate`,
      expected: `<= ${maximum}`,
      actual,
      passed: actual !== null && actual <= maximum
    });
  }
  results.push({
    gate: "urgent.falsePositives",
    expected: `<= ${gates.maximumFalseUrgent}`,
    actual: report.metrics.falseUrgentIds.length,
    passed: report.metrics.falseUrgentIds.length <= gates.maximumFalseUrgent
  });
  results.push({
    gate: "urgent.missed",
    expected: `<= ${gates.maximumMissedUrgent}`,
    actual: report.metrics.missedUrgentIds.length,
    passed: report.metrics.missedUrgentIds.length <= gates.maximumMissedUrgent
  });
  results.push({
    gate: "evidence.missing",
    expected: "0",
    actual: report.metrics.evidence.missing.length,
    passed: report.metrics.evidence.missing.length === 0
  });
  for (const [metric, minimum] of Object.entries(gates.topic)) {
    const actual = report.metrics.topic[metric];
    results.push({
      gate: `topic.${metric}`,
      expected: `>= ${minimum}`,
      actual,
      passed: actual !== null && actual >= minimum
    });
  }
  return {
    passed: results.every((result) => result.passed),
    results
  };
};
