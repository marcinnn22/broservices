import { performance } from "node:perf_hooks";

import type { RequestHandler } from "express";

import type { ApplicationMetrics } from "../../observability/metrics.js";
import { onResponseCompletion } from "../response-completion.js";
import { getRouteTemplate } from "../route-template.js";

export interface HttpMetricsMiddlewareOptions {
  readonly excludePaths?: readonly string[];
  readonly onInstrumentationError?: (error: unknown) => void;
}

const requestPath = (originalUrl: string): string => originalUrl.split("?", 1)[0] ?? originalUrl;

export function createHttpMetricsMiddleware(
  metrics: ApplicationMetrics,
  options: HttpMetricsMiddlewareOptions = {},
): RequestHandler {
  const excludedPaths = new Set(options.excludePaths ?? []);

  return (request, response, next): void => {
    if (excludedPaths.has(requestPath(request.originalUrl))) {
      next();
      return;
    }

    const startedAt = performance.now();

    try {
      metrics.startHttpRequest(request.method);
    } catch (error) {
      options.onInstrumentationError?.(error);
    }

    onResponseCompletion(response, ({ aborted }) => {
      const statusCode = aborted ? 499 : response.statusCode;

      try {
        metrics.finishHttpRequest({
          method: request.method,
          route: getRouteTemplate(request),
          statusCode,
          durationSeconds: (performance.now() - startedAt) / 1_000,
        });
      } catch (error) {
        options.onInstrumentationError?.(error);
      }
    });

    next();
  };
}
