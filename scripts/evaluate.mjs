import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { classifyWithWeakBaseline } from "../evaluation/baselines/weak.js";
import {
  classifyWithDeterministicDates
} from "../evaluation/classifiers/deterministic-dates.js";
import {
  classifyWithDeterministicCore
} from "../evaluation/classifiers/deterministic-core.js";
import {
  assessQualityGates,
  evaluateClassifier
} from "../evaluation/scoring.js";
import { validateEvaluationDataset } from "../evaluation/schema.js";
import { loadEvaluationDataset } from "../evaluation/dataset.js";

const root = resolve(process.cwd());
const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf("--output");
const outputPath = outputIndex >= 0 ? argumentsList[outputIndex + 1] : "";
const requireGates = argumentsList.includes("--require-gates");
const datasetIndex = argumentsList.indexOf("--dataset");
const datasetVersion = datasetIndex >= 0 ? argumentsList[datasetIndex + 1] : "v1";
const classifierIndex = argumentsList.indexOf("--classifier");
const classifierName = classifierIndex >= 0 ? argumentsList[classifierIndex + 1] : "weak";
const classifiers = {
  weak: classifyWithWeakBaseline,
  "deterministic-dates": classifyWithDeterministicDates,
  "deterministic-core": classifyWithDeterministicCore
};
const classifier = classifiers[classifierName];
if (!classifier) {
  throw new Error(`Unknown classifier "${classifierName}". Choose: ${Object.keys(classifiers).join(", ")}`);
}

const dataset = await loadEvaluationDataset(root, datasetVersion);
const gates = JSON.parse(await readFile(
  resolve(root, "evaluation/quality-gates.json"),
  "utf8"
));
const validation = validateEvaluationDataset(dataset);
if (!validation.valid) {
  throw new Error(`Evaluation dataset is invalid:\n${validation.errors.join("\n")}`);
}

const report = evaluateClassifier(dataset, classifier);
report.qualityGates = assessQualityGates(report, gates);
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  const absoluteOutput = resolve(root, outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, serialized);
  console.log(`Wrote ${outputPath}`);
} else {
  process.stdout.write(serialized);
}

if (requireGates && !report.qualityGates.passed) {
  process.exitCode = 1;
}
