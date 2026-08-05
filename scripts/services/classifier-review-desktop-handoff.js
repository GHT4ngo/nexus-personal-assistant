const DEFAULT_MARKER = "</head>";
const HANDOFF_ID = "nexus-classifier-review-bootstrap";
const BOOTSTRAP_PATH = "/api/classifier/reviews/bootstrap";

const responseHeaders = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/html; charset=utf-8",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
});

const serializeForHtml = (value) =>
  JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

const reject = (code) => Object.freeze({
  status: "rejected",
  code,
  body: null,
  headers: null
});

export const createClassifierReviewDesktopHandoff = ({
  trustedBootstrap,
  marker = DEFAULT_MARKER,
  activationPath = null
} = {}) => {
  if (!trustedBootstrap || typeof trustedBootstrap.issue !== "function") {
    throw new TypeError("Desktop handoff requires trusted bootstrap issuance.");
  }
  if (typeof marker !== "string" || marker.length === 0) {
    throw new TypeError("Desktop handoff requires an explicit HTML marker.");
  }
  if (activationPath !== null
    && (typeof activationPath !== "string"
      || !/^\/[a-z0-9/_-]+\.js$/.test(activationPath))) {
    throw new TypeError("Desktop handoff requires a safe activation path.");
  }

  return Object.freeze({
    render: ({ html, origin } = {}) => {
      if (typeof html !== "string" || html.length === 0) {
        return reject("handoff.document.invalid");
      }
      const markerIndex = html.indexOf(marker);
      if (markerIndex < 0 || html.indexOf(marker, markerIndex + marker.length) >= 0) {
        return reject("handoff.marker.invalid");
      }

      const issued = trustedBootstrap.issue(origin);
      if (issued?.status !== "issued"
        || typeof issued.bootstrapCode !== "string"
        || issued.bootstrapCode.length === 0
        || !Number.isFinite(issued.expiresAt)) {
        return reject("handoff.issuance.denied");
      }

      const payload = serializeForHtml({
        bootstrapCode: issued.bootstrapCode,
        bootstrapPath: BOOTSTRAP_PATH,
        expiresAt: issued.expiresAt
      });
      const activation = activationPath
        ? `<script type="module" src="${activationPath}"></script>`
        : "";
      const handoff =
        `<script type="application/json" id="${HANDOFF_ID}">${payload}</script>${activation}`;
      return Object.freeze({
        status: "ready",
        code: null,
        body: `${html.slice(0, markerIndex)}${handoff}${html.slice(markerIndex)}`,
        headers: responseHeaders
      });
    }
  });
};
