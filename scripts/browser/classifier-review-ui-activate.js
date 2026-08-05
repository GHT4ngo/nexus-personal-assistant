import {
  createClassifierReviewUi
} from "./classifier-review-ui.js";

const ROOT_ID = "nexus-classifier-review-root";
const HANDOFF_ID = "nexus-classifier-review-bootstrap";
const document = globalThis.document;
const root = document?.getElementById?.(ROOT_ID);

if (root) {
  const ui = createClassifierReviewUi({
    document,
    root,
    lifecycleTarget: globalThis
  });
  void ui.start();
} else {
  const handoff = document?.getElementById?.(HANDOFF_ID);
  if (handoff) {
    handoff.textContent = "";
    handoff.remove?.();
  }
}
