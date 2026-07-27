import { timingSafeEqual } from "node:crypto";

import { type RequestHandler, Router } from "express";

import { HttpError } from "../../../platform/http/errors/http-error.js";
import type { Logger } from "../../../platform/observability/logger.js";
import type { ApplicationMetrics } from "../../../platform/observability/metrics.js";
import { type AlertWebhookHandler, alertWebhookSchema } from "../application/alert-webhook.js";
import type { HealthService } from "../application/health-service.js";

export interface MonitoringRouterOptions {
  readonly health: HealthService;
  readonly metrics: ApplicationMetrics;
  readonly logger: Logger;
  readonly rateLimit: RequestHandler;
  readonly metricsEnabled?: boolean;
  readonly metricsBearerToken?: string;
  readonly alertWebhook?: {
    readonly token: string;
    readonly handle: AlertWebhookHandler;
  };
}

const extractBearerToken = (authorization: string | undefined): string | undefined => {
  if (authorization === undefined) {
    return undefined;
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization.trim());
  return match?.[1];
};

const tokensEqual = (actual: string | undefined, expected: string): boolean => {
  if (actual === undefined) {
    return false;
  }

  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
};

export function createMonitoringRouter(options: MonitoringRouterOptions): Router {
  const router = Router();

  router.use((_request, response, next): void => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/liveness", (_request, response) => {
    response.status(200).json(options.health.liveness());
  });

  router.get("/readiness", async (_request, response) => {
    const report = await options.health.readiness();
    response.status(report.status === "ready" ? 200 : 503).json(report);
  });

  // Kubernetes and load-balancer probes must never consume an IP quota. All
  // non-probe monitoring surfaces remain protected below this boundary.
  router.use(options.rateLimit);

  router.get("/health", async (_request, response) => {
    const report = await options.health.readiness();
    response.status(report.status === "ready" ? 200 : 503).json({
      status: report.status === "ready" ? "ok" : "degraded",
      timestamp: report.timestamp,
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      checks: report.checks,
    });
  });

  if (options.metricsEnabled !== false) {
    const metricsBearerToken = options.metricsBearerToken;

    if (metricsBearerToken === undefined) {
      throw new Error("A metrics bearer token is required when metrics are enabled");
    }

    router.get("/metrics", async (request, response, next) => {
      const token = extractBearerToken(request.get("authorization"));

      if (!tokensEqual(token, metricsBearerToken)) {
        next(HttpError.unauthorized("The metrics bearer token is invalid."));
        return;
      }

      try {
        response.setHeader("Content-Type", options.metrics.contentType);
        response.status(200).send(await options.metrics.metrics());
      } catch (error) {
        options.logger.error("Prometheus metrics collection failed", { error });
        next(error);
      }
    });
  }

  const alertWebhook = options.alertWebhook;

  if (alertWebhook !== undefined) {
    router.post("/alerts", async (request, response, next) => {
      const token =
        extractBearerToken(request.get("authorization")) ?? request.get("x-alertmanager-token");

      if (!tokensEqual(token, alertWebhook.token)) {
        next(HttpError.unauthorized("The alert webhook token is invalid."));
        return;
      }

      const result = alertWebhookSchema.safeParse(request.body);

      if (!result.success) {
        next(result.error);
        return;
      }

      try {
        await alertWebhook.handle(result.data, {
          requestId: request.requestId,
        });
        response.status(202).json({
          status: "accepted",
          requestId: request.requestId,
        });
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}
