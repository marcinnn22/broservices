import compression from "compression";
import type { RequestHandler } from "express";

export function createCompressionMiddleware(): RequestHandler {
  return compression({
    threshold: 1_024,
    filter(request, response): boolean {
      if (request.headers["x-no-compression"] !== undefined) {
        return false;
      }

      if (request.headers.accept?.includes("text/event-stream")) {
        return false;
      }

      return compression.filter(request, response);
    },
  });
}
