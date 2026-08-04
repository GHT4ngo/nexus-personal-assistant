import { createHash, randomBytes } from "node:crypto";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const normalizeOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.pathname === "/" && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

export const createClassifierReviewBootstrapService = ({
  token,
  allowedOrigins,
  ttlMs = 60_000,
  now = () => Date.now(),
  generateCode = () => randomBytes(32).toString("base64url")
} = {}) => {
  if (typeof token !== "string" || Buffer.byteLength(token, "utf8") < 32) {
    throw new TypeError("Review bootstrap requires a strong token.");
  }
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    throw new TypeError("Review bootstrap requires allowed origins.");
  }
  const origins = allowedOrigins.map(normalizeOrigin);
  if (origins.some((origin) => !origin) || new Set(origins).size !== origins.length) {
    throw new TypeError("Review bootstrap requires unique valid origins.");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 300_000) {
    throw new TypeError("Review bootstrap ttlMs must be between 1s and 5m.");
  }
  const allowed = new Set(origins);
  const pendingByOrigin = new Map();

  return {
    issue: (origin) => {
      const normalized = normalizeOrigin(origin);
      if (!normalized || !allowed.has(normalized)) {
        return { status: "rejected", code: "bootstrap.origin.denied" };
      }
      const code = generateCode();
      if (typeof code !== "string" || Buffer.byteLength(code, "utf8") < 32) {
        throw new TypeError("Review bootstrap generated an invalid code.");
      }
      const expiresAt = now() + ttlMs;
      pendingByOrigin.set(normalized, {
        codeHash: digest(code),
        expiresAt
      });
      return {
        status: "issued",
        code: null,
        bootstrapCode: code,
        expiresAt
      };
    },
    redeem: ({ origin, bootstrapCode } = {}) => {
      const normalized = normalizeOrigin(origin);
      const pending = normalized ? pendingByOrigin.get(normalized) : null;
      if (!pending
        || typeof bootstrapCode !== "string"
        || pending.expiresAt < now()
        || digest(bootstrapCode) !== pending.codeHash) {
        if (pending?.expiresAt < now()) {
          pendingByOrigin.delete(normalized);
        }
        return { status: "rejected", code: "bootstrap.denied" };
      }
      pendingByOrigin.delete(normalized);
      return {
        status: "ready",
        code: null,
        token
      };
    },
    clear: () => pendingByOrigin.clear(),
    pendingCount: () => pendingByOrigin.size
  };
};
