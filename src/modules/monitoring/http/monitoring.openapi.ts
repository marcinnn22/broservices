import type { OpenApiFragment } from "../../../platform/http/openapi.js";

const healthResponse = {
  description: "Health state.",
  headers: {
    "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  },
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/HealthReport" },
    },
  },
};

export const monitoringOpenApi: OpenApiFragment = {
  tags: [
    {
      name: "Monitoring",
      description: "Process health and operational telemetry.",
    },
  ],
  paths: {
    "/monitoring/liveness": {
      get: {
        tags: ["Monitoring"],
        summary: "Check whether the API process is alive",
        operationId: "getLiveness",
        responses: {
          "200": healthResponse,
        },
      },
    },
    "/monitoring/readiness": {
      get: {
        tags: ["Monitoring"],
        summary: "Check whether this instance can receive traffic",
        operationId: "getReadiness",
        responses: {
          "200": healthResponse,
          "503": healthResponse,
        },
      },
    },
    "/monitoring/health": {
      get: {
        tags: ["Monitoring"],
        summary: "Get aggregate application health",
        operationId: "getHealth",
        responses: {
          "200": healthResponse,
          "503": healthResponse,
        },
      },
    },
    "/monitoring/metrics": {
      get: {
        tags: ["Monitoring"],
        summary: "Expose Prometheus metrics",
        operationId: "getMetrics",
        security: [{ metricsBearerToken: [] }],
        responses: {
          "200": {
            description: "Prometheus text exposition format.",
            content: {
              "text/plain": {
                schema: { type: "string" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/monitoring/alerts": {
      post: {
        tags: ["Monitoring"],
        summary: "Receive an Alertmanager webhook",
        operationId: "receiveAlertmanagerWebhook",
        security: [{ alertWebhookToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AlertWebhook" },
            },
          },
        },
        responses: {
          "202": { description: "Alert accepted." },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      metricsBearerToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque token",
      },
      alertWebhookToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque token",
      },
    },
    schemas: {
      HealthReport: {
        type: "object",
        required: ["status", "timestamp"],
        properties: {
          status: {
            type: "string",
            enum: ["ok", "degraded", "ready", "not_ready"],
          },
          timestamp: { type: "string", format: "date-time" },
          uptimeSeconds: { type: "number", minimum: 0 },
          checks: {
            type: "object",
            additionalProperties: {
              type: "object",
              required: ["status", "durationMs"],
              properties: {
                status: { type: "string", enum: ["up", "down"] },
                durationMs: { type: "number", minimum: 0 },
              },
            },
          },
        },
      },
      AlertWebhook: {
        type: "object",
        required: [
          "version",
          "groupKey",
          "status",
          "receiver",
          "groupLabels",
          "commonLabels",
          "commonAnnotations",
          "externalURL",
          "alerts",
        ],
        properties: {
          version: { type: "string" },
          groupKey: { type: "string" },
          status: { type: "string", enum: ["firing", "resolved"] },
          receiver: { type: "string" },
          groupLabels: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          commonLabels: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          commonAnnotations: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          externalURL: { type: "string" },
          alerts: { type: "array", maxItems: 1_000, items: { type: "object" } },
        },
      },
    },
  },
};
