import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const VERSION_PATTERN = /^v\d+$/;

export const loadEvaluationDataset = async (root, version = "v1", seen = new Set()) => {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid evaluation dataset version "${version}".`);
  }
  if (seen.has(version)) {
    throw new Error(`Evaluation dataset cycle detected at "${version}".`);
  }
  const nextSeen = new Set(seen).add(version);
  const path = resolve(root, "evaluation", "fixtures", version, "messages.json");
  const dataset = JSON.parse(await readFile(path, "utf8"));
  if (!dataset.baseVersion) {
    return dataset;
  }
  const base = await loadEvaluationDataset(root, dataset.baseVersion, nextSeen);
  return {
    ...dataset,
    description: `${base.description} ${dataset.description}`,
    items: [...base.items, ...dataset.items]
  };
};
