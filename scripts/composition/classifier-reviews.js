import { isAbsolute } from "node:path";

import {
  createClassifierReviewRequestGuard
} from "../http/classifier-review-guard.js";
import {
  createClassifierReviewRouteHandler
} from "../routes/classifier-reviews.js";
import {
  createClassifierReviewCommandService
} from "../services/classifier-review-command.js";
import {
  createClassifierReviewViewService
} from "../services/classifier-review-view.js";
import {
  createClassifierStore
} from "../storage/classifier-store.js";

const disabledHandler = async () => false;

export const createClassifierReviewComposition = ({
  enabled = false,
  privateFilePath,
  allowedOrigins,
  commandToken,
  readRequestBody,
  sendJson,
  now = () => new Date()
} = {}) => {
  if (enabled !== true) {
    return {
      enabled: false,
      handleRequest: disabledHandler
    };
  }
  if (typeof privateFilePath !== "string"
    || privateFilePath.trim() === ""
    || !isAbsolute(privateFilePath)) {
    throw new TypeError(
      "Enabled classifier reviews require an explicit absolute privateFilePath."
    );
  }
  if (typeof readRequestBody !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Enabled classifier reviews require HTTP adapters.");
  }

  const store = createClassifierStore({
    filePath: privateFilePath,
    now
  });
  const viewService = createClassifierReviewViewService({ store });
  const commandService = createClassifierReviewCommandService({ store, now });
  const routeHandler = createClassifierReviewRouteHandler({
    viewService,
    commandService,
    readRequestBody,
    sendJson
  });
  const handleRequest = createClassifierReviewRequestGuard({
    handler: routeHandler,
    allowedOrigins,
    commandToken,
    sendJson
  });

  return {
    enabled: true,
    handleRequest
  };
};
