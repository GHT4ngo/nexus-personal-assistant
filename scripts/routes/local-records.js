import {
  createGoalRecord,
  createReviewDecisionRecord,
  createTaskRecord
} from "../../src/domain/records.js";
import { mergeStoredRecords } from "../storage/record-store.js";

const collectionPath = /^\/api\/local\/(tasks|goals)$/;
const itemPath = /^\/api\/local\/(tasks|goals)\/([^/]+)$/;

const safeErrors = (error) => Array.isArray(error?.errors)
  ? error.errors.map(({ path, code, message }) => ({ path, code, message }))
  : [{ path: "$", code: "request.invalid", message: "Invalid request." }];

const recordTypeFor = (collection) => collection === "tasks" ? "task" : "goal";

const responseData = (store) => ({
  records: store.records,
  tasks: store.records.filter((record) => record.recordType === "task"),
  goals: store.records.filter((record) => record.recordType === "goal"),
  reviews: store.records.filter((record) => record.recordType === "review-decision"),
  updatedAt: store.updatedAt
});

export const createLocalRecordRouteHandler = ({
  readStore,
  writeStore,
  readRequestBody,
  sendJson,
  now = () => new Date(),
  idGenerator
}) => {
  const persist = (existing, incoming, timestamp) => {
    const merged = mergeStoredRecords(existing, [incoming]);
    const next = {
      schemaVersion: 1,
      updatedAt: timestamp,
      records: merged.records
    };
    writeStore(next);
    return { store: next, rejected: merged.rejected };
  };

  const readBody = async (request) => {
    const body = JSON.parse(await readRequestBody(request) || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new TypeError("Request body must be a JSON object.");
    }
    return body;
  };

  return async (request, url, response) => {
    if (url.pathname === "/api/local/records" && request.method === "GET") {
      sendJson(response, 200, responseData(readStore()));
      return true;
    }

    if (url.pathname === "/api/local/reviews") {
      if (request.method !== "POST") {
        sendJson(response, 405, { message: "Method not allowed." });
        return true;
      }
      try {
        const body = await readBody(request);
        const timestamp = now().toISOString();
        const record = createReviewDecisionRecord({
          sourceId: `review-${idGenerator()}`,
          title: `Manual ${body.decision || "review"} decision`,
          subjectRecordId: body.subjectRecordId,
          decision: body.decision,
          decidedAt: timestamp,
          normalizedAt: timestamp
        });
        const result = persist(readStore().records, record, timestamp);
        sendJson(response, 201, { record, ...responseData(result.store) });
      } catch (error) {
        sendJson(response, 400, {
          message: "Local review request is invalid.",
          errors: safeErrors(error)
        });
      }
      return true;
    }

    const collectionMatch = url.pathname.match(collectionPath);
    const itemMatch = url.pathname.match(itemPath);
    if (!collectionMatch && !itemMatch) {
      return false;
    }

    try {
      if (collectionMatch && request.method === "POST") {
        const collection = collectionMatch[1];
        const body = await readBody(request);
        const timestamp = now().toISOString();
        const sourceId = `${recordTypeFor(collection)}-${idGenerator()}`;
        const common = {
          sourceId,
          title: body.title,
          text: body.text || "",
          relatedRecordIds: Array.isArray(body.relatedRecordIds) ? body.relatedRecordIds : [],
          createdAt: timestamp,
          normalizedAt: timestamp
        };
        const record = collection === "tasks"
          ? createTaskRecord({ ...common, dueAt: body.dueAt || null })
          : createGoalRecord({ ...common, targetAt: body.targetAt || null });
        const result = persist(readStore().records, record, timestamp);
        sendJson(response, 201, { record, ...responseData(result.store) });
        return true;
      }

      if (itemMatch && request.method === "PATCH") {
        const collection = itemMatch[1];
        const sourceId = decodeURIComponent(itemMatch[2]);
        const recordType = recordTypeFor(collection);
        const store = readStore();
        const current = store.records.find((record) =>
          record.recordType === recordType && record.sourceId === sourceId);
        if (!current) {
          sendJson(response, 404, { message: `${recordType} record not found.` });
          return true;
        }

        const body = await readBody(request);
        const timestamp = now().toISOString();
        const common = {
          sourceId: current.sourceId,
          title: current.title,
          text: current.text,
          sourceUrl: current.sourceUrl,
          status: body.status,
          relatedRecordIds: current.relatedRecordIds,
          createdAt: current.createdAt,
          normalizedAt: timestamp,
          retentionExpiresAt: current.retention.expiresAt
        };
        const record = collection === "tasks"
          ? createTaskRecord({ ...common, dueAt: current.dueAt })
          : createGoalRecord({ ...common, targetAt: current.targetAt });
        const result = persist(store.records, record, timestamp);
        sendJson(response, 200, { record, ...responseData(result.store) });
        return true;
      }

      sendJson(response, 405, { message: "Method not allowed." });
      return true;
    } catch (error) {
      sendJson(response, 400, {
        message: "Local record request is invalid.",
        errors: safeErrors(error)
      });
      return true;
    }
  };
};
