import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { validateRecord } from "../../src/domain/validation.js";

const STORE_SCHEMA_VERSION = 1;

const emptyStore = () => ({
  schemaVersion: STORE_SCHEMA_VERSION,
  updatedAt: null,
  suggestions: [],
  reviews: []
});

export class ClassifierStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ClassifierStoreError";
    this.code = code;
  }
}

const storeError = (code, message) => new ClassifierStoreError(code, message);

const recordDiagnostic = (collection, index, record, code) => ({
  collection,
  index,
  recordId: typeof record?.recordId === "string" ? record.recordId : null,
  code
});

const validCollectionRecord = (record, collection) => {
  if (!validateRecord(record).valid) {
    return false;
  }
  if (collection === "suggestions") {
    return record.recordType === "classifier-suggestion";
  }
  return record.recordType === "review-decision"
    && record.reviewKind === "classifier-suggestion";
};

const assertStoreShape = (store) => {
  if (!store
    || store.schemaVersion !== STORE_SCHEMA_VERSION
    || !Array.isArray(store.suggestions)
    || !Array.isArray(store.reviews)
    || !(store.updatedAt === null || typeof store.updatedAt === "string")) {
    throw storeError("store.invalid", "Classifier store has an invalid format.");
  }

  for (const collection of ["suggestions", "reviews"]) {
    if (!store[collection].every((record) =>
      validCollectionRecord(record, collection))) {
      throw storeError(
        "store.invalid-records",
        "Classifier store contains invalid records."
      );
    }
  }
};

const readStore = async (filePath) => {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return emptyStore();
    }
    throw storeError("store.read-failed", "Classifier store could not be read.");
  }

  let store;
  try {
    store = JSON.parse(source);
  } catch {
    throw storeError("store.invalid", "Classifier store has an invalid format.");
  }
  assertStoreShape(store);
  return store;
};

const writeStore = async (filePath, store) => {
  const directory = dirname(filePath);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(store, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600);
  } catch {
    await unlink(temporaryPath).catch(() => {});
    throw storeError("store.write-failed", "Classifier store could not be written.");
  }
};

const appendRecords = (stored, incoming, collection) => {
  const records = Array.isArray(incoming) ? incoming : [];
  const result = [...stored];
  const byId = new Map(result.map((record) => [record.recordId, record]));
  const accepted = [];
  const idempotent = [];
  const rejected = [];

  records.forEach((record, index) => {
    if (!validCollectionRecord(record, collection)) {
      rejected.push(recordDiagnostic(collection, index, record, "record.invalid"));
      return;
    }

    const existing = byId.get(record.recordId);
    if (existing) {
      if (isDeepStrictEqual(existing, record)) {
        idempotent.push(record.recordId);
      } else {
        rejected.push(recordDiagnostic(collection, index, record, "record.conflict"));
      }
      return;
    }

    result.push(record);
    byId.set(record.recordId, record);
    accepted.push(record.recordId);
  });

  return { records: result, accepted, idempotent, rejected };
};

export const createClassifierStore = ({ filePath, now = () => new Date() } = {}) => {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new TypeError("Classifier store requires an explicit filePath.");
  }

  const append = async (records, collection) => {
    const current = await readStore(filePath);
    const merged = appendRecords(current[collection], records, collection);
    const next = {
      ...current,
      [collection]: merged.records
    };

    if (merged.accepted.length > 0) {
      next.updatedAt = now().toISOString();
      await writeStore(filePath, next);
    }

    return {
      store: structuredClone(next),
      accepted: merged.accepted,
      idempotent: merged.idempotent,
      rejected: merged.rejected
    };
  };

  return {
    read: async () => structuredClone(await readStore(filePath)),
    appendSuggestions: (records) => append(records, "suggestions"),
    appendReviews: (records) => append(records, "reviews")
  };
};
