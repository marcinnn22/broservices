import { performance } from "node:perf_hooks";

import type { RequestHandler } from "express";

import type { Logger } from "../../observability/logger.js";
import { onResponseCompletion } from "../response-completion.js";
import { getRouteTemplate } from "../route-template.js";

export interface RequestLoggerOptions {
  readonly quietPaths?: readonly string[];
}

const requestPath = (originalUrl: string): string => originalUrl.split("?", 1)[0] ?? originalUrl;

export function createRequestLoggerMiddleware(
  logger: Logger,
  options: RequestLoggerOptions = {},
): RequestHandler {
  const quietPaths = new Set(options.quietPaths ?? []);

  return (request, response, next): void => {
    const startedAt = performance.now();

    onResponseCompletion(response, ({ aborted }) => {
      const statusCode = aborted ? 499 : response.statusCode;
      const metadata = {
        requestId: request.requestId,
        method: request.method,
        route: getRouteTemplate(request),
        statusCode,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        responseSize: response.getHeader("content-length"),
        aborted,
      };

      if (quietPaths.has(requestPath(request.originalUrl))) {
        logger.debug("HTTP request completed", metadata);
      } else if (statusCode >= 500) {
        logger.error("HTTP request failed", metadata);
      } else if (statusCode >= 400) {
        logger.warn("HTTP request rejected", metadata);
      } else {
        logger.info("HTTP request completed", metadata);
      }
    });

    next();
  };
}
