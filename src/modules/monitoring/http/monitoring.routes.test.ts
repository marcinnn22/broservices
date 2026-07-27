import express, { type RequestHandler } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createErrorHandler } from "../../../platform/http/middleware/error-handler.js";
import { createRequestIdMiddleware } from "../../../platform/http/middleware/request-id.js";
import type { Logger } from "../../../platform/observability/logger.js";
import { type ApplicationMetrics, createMetrics } from "../../../platform/observability/metrics.js";
import type { AlertWebhookHandler } from "../application/alert-webhook.js";
import { createHealthService } from "../application/health-service.js";
import { createMonitoringRouter } from "./monitoring.routes.js";

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
} as unknown as Logger;

const openMetrics: ApplicationMetrics[] = [];
const metricsBearerToken = "metrics-token-that-is-at-least-32-characters";

afterEach(() => {
  for (const metrics of openMetrics.splice(0)) {
    metrics.close();
  }
});

const createTestApp = (options?: {
  readonly alertHandler?: AlertWebhookHandler;
  readonly rateLimit?: RequestHandler;
}) => {
  const metrics = createMetrics({
    serviceName: "test-api",
    collectDefaultMetrics: false,
  });
  openMetrics.push(metrics);
  const health = createHealthService({
    checks: [
      {
        name: "postgres",
        async check(): Promise<void> {},
      },
    ],
    timeoutMs: 100,
    logger,
  });
  const app = express();

  app.use(createRequestIdMiddleware());
  app.use(express.json());
  app.use(
    "/monitoring",
    createMonitoringRouter({
      health,
      metrics,
      logger,
      rateLimit: options?.rateLimit ?? ((_request, _response, next) => next()),
      metricsBearerToken,
      ...(options?.alertHandler === undefined
        ? {}
        : {
            alertWebhook: {
              token: "alert-token-that-is-at-least-32-characters",
              handle: options.alertHandler,
            },
          }),
    }),
  );
  app.use(createErrorHandler({ logger }));

  return app;
};

describe("monitoring router", () => {
  it("keeps liveness independent from readiness dependencies", async () => {
    const response = await request(createTestApp()).get("/monitoring/liveness").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      uptimeSeconds: expect.any(Number),
    });
  });

  it("keeps orchestrator probes outside the monitoring IP quota", async () => {
    const rateLimit = vi.fn<RequestHandler>((_request, response) => {
      response.status(429).send();
    });
    const app = createTestApp({ rateLimit });

    await request(app).get("/monitoring/liveness").expect(200);
    await request(app).get("/monitoring/readiness").expect(200);
    await request(app).get("/monitoring/health").expect(429);

    expect(rateLimit).toHaveBeenCalledOnce();
  });

  it("serves the single Prometheus registry as text", async () => {
    const app = createTestApp();

    await request(app).get("/monitoring/metrics").expect(401);
    await request(app)
      .get("/monitoring/metrics")
      .set("Authorization", "Bearer wrong-token")
      .expect(401);
    const response = await request(app)
      .get("/monitoring/metrics")
      .set("Authorization", `Bearer ${metricsBearerToken}`)
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/^text\/plain/);
    expect(response.text).toContain("# HELP http_requests_total");
  });

  it("authenticates and validates Alertmanager webhooks", async () => {
    const alertHandler = vi.fn<AlertWebhookHandler>();
    const app = createTestApp({ alertHandler });
    const payload = {
      version: "4",
      groupKey: '{}:{alertname="ApiDown"}',
      status: "firing",
      receiver: "api",
      groupLabels: { alertname: "ApiDown" },
      commonLabels: { severity: "critical" },
      commonAnnotations: { summary: "API is unavailable" },
      externalURL: "http://alertmanager:9093",
      alerts: [
        {
          status: "firing",
          labels: { alertname: "ApiDown" },
          annotations: { summary: "API is unavailable" },
          startsAt: "2026-01-01T00:00:00.000Z",
          endsAt: "2026-01-01T01:00:00.000Z",
          generatorURL: "http://prometheus:9090/graph",
          fingerprint: "abc123",
        },
      ],
    };

    await request(app).post("/monitoring/alerts").send(payload).expect(401);
    await request(app)
      .post("/monitoring/alerts")
      .set("Authorization", "Bearer alert-token-that-is-at-least-32-characters")
      .send(payload)
      .expect(202);

    expect(alertHandler).toHaveBeenCalledOnce();
  });
});
