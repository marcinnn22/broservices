import type { ErrorRequestHandler, RequestHandler } from "express";

import type { AppConfig } from "../config/app-config.js";
import type { Logger } from "../observability/logger.js";
import type { ApplicationMetrics } from "../observability/metrics.js";
import { createBodyParsers } from "./middleware/body-parsers.js";
import { createCompressionMiddleware } from "./middleware/compression.js";
import { createCookieParserMiddleware } from "./middleware/cookies.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createErrorHandler, type ErrorMapper } from "./middleware/error-handler.js";
import { createHttpMetricsMiddleware } from "./middleware/http-metrics.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { createRateLimiters, type RateLimiters } from "./middleware/rate-limit.js";
import { createRequestIdMiddleware } from "./middleware/request-id.js";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.js";
import { createSecurityMiddleware } from "./middleware/security.js";

export interface HttpMiddleware {
  /**
   * Mount before route-specific middleware and body parsers.
   */
  readonly beforeRoutes: readonly RequestHandler[];
  /**
   * Bootstrap mounts the API-wide policy. Feature routers co-locate their
   * route-specific policies with the routes they protect.
   */
  readonly rateLimiters: RateLimiters;
  /**
   * Mount after every application and documentation route.
   */
  readonly notFound: RequestHandler;
  /**
   * Always mount last.
   */
  readonly errorHandler: ErrorRequestHandler;
}

export function createHttpMiddleware(options: {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly metrics: ApplicationMetrics;
  readonly errorMappers?: readonly ErrorMapper[];
}): HttpMiddleware {
  const { config, logger, metrics } = options;
  const metricsPath = "/monitoring/metrics";
  const quietPaths = [
    "/monitoring/health",
    "/monitoring/liveness",
    "/monitoring/readiness",
    metricsPath,
  ];

  const beforeRoutes: RequestHandler[] = [
    createRequestIdMiddleware(),
    createRequestLoggerMiddleware(logger, { quietPaths }),
  ];

  if (config.monitoring.metricsEnabled) {
    beforeRoutes.push(
      createHttpMetricsMiddleware(metrics, {
        excludePaths: [metricsPath],
        onInstrumentationError(error): void {
          logger.warn("HTTP metrics instrumentation failed", { error });
        },
      }),
    );
  }

  beforeRoutes.push(
    ...createSecurityMiddleware({
      production: config.environment === "production",
    }),
    createCorsMiddleware(config.cors),
    createCompressionMiddleware(),
    createCookieParserMiddleware(),
    ...createBodyParsers(config.server.jsonBodyLimit),
  );

  return {
    beforeRoutes,
    rateLimiters: createRateLimiters(config.rateLimit),
    notFound: notFoundHandler,
    errorHandler: createErrorHandler({
      logger,
      ...(options.errorMappers === undefined ? {} : { errorMappers: options.errorMappers }),
    }),
  };
}
