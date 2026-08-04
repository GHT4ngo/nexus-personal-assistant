export class RequestBodyError extends Error {
  constructor(code) {
    super("Request body could not be read.");
    this.name = "RequestBodyError";
    this.code = code;
  }
}

export const createBoundedRequestBodyReader = ({
  defaultMaxBytes = 1024 * 1024
} = {}) => {
  if (!Number.isSafeInteger(defaultMaxBytes) || defaultMaxBytes <= 0) {
    throw new TypeError("Body reader requires a positive defaultMaxBytes.");
  }

  return (request, requestedMaxBytes = defaultMaxBytes) =>
    new Promise((resolve, reject) => {
      const maxBytes = Math.min(defaultMaxBytes, requestedMaxBytes);
      const chunks = [];
      let bytes = 0;
      let settled = false;

      request.on("data", (chunk) => {
        if (settled) {
          return;
        }
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes) {
          settled = true;
          request.resume?.();
          reject(new RequestBodyError("request.body-too-large"));
          return;
        }
        chunks.push(buffer);
      });
      request.on("end", () => {
        if (!settled) {
          settled = true;
          resolve(Buffer.concat(chunks).toString("utf8"));
        }
      });
      request.on("error", () => {
        if (!settled) {
          settled = true;
          reject(new RequestBodyError("request.body.unreadable"));
        }
      });
    });
};
