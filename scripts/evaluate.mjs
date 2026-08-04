import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { classifyWithWeakBaseline } from "../evaluation/baselines/weak.js";
import {
  assessQualityGates,
  evaluateClassifier
} from "../evaluation/scoring.js";
import { validateEvaluationDataset } from "../evaluation/schema.js";

const root = resolve(process.cwd());
const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf("--output");
const outputPath = outputIndex >= 0 ? argumentsList[outputIndex + 1] : "";
const requireGates = argumentsList.includes("--require-gates");

const dataset = JSON.parse(await readFile(
  resolve(root, "evaluation/fixtures/v1/messages.json"),
  "utf8"
));
const gates = JSON.parse(await readFile(
  resolve(root, "evaluation/quality-gates.json"),
  "utf8"
));
const validation = validateEvaluationDataset(dataset);
if (!validation.valid) {
  throw new Error(`Evaluation dataset is invalid:\n${validation.errors.join("\n")}`);
}

const report = evaluateClassifier(dataset, classifyWithWeakBaseline);
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
