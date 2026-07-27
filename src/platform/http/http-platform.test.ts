import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Logger } from "../observability/logger.js";
import { type ApplicationMetrics, createMetrics } from "../observability/metrics.js";
import { HttpError } from "./errors/http-error.js";
import { joinHttpPath } from "./index.js";
import { createBodyParsers } from "./middleware/body-parsers.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createHttpMetricsMiddleware } from "./middleware/http-metrics.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { createRateLimiters } from "./middleware/rate-limit.js";
import { createRequestIdMiddleware } from "./middleware/request-id.js";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.js";
import { createDocsSecurityMiddleware, createSecurityMiddleware } from "./middleware/security.js";
import { validateRequest } from "./middleware/validate-request.js";

const openMetrics: ApplicationMetrics[] = [];

afterEach(() => {
  for (const metrics of openMetrics.splice(0)) {
    metrics.close();
  }
  vi.clearAllMocks();
});

const logError = vi.fn();
const logWarning = vi.fn();
const logger = {
  error: logError,
  warn: logWarning,
} as unknown as Logger;

describe("HTTP platform middleware", () => {
  it("allows mutating same-origin browser requests without a CORS allowlist entry", async () => {
    const app = express();

    app.use(
      createCorsMiddleware({
        allowedOrigins: ["http://localhost:5173"],
        credentials: true,
      }),
    );
    app.post("/try-it", (_request, response) => response.status(204).send());
    app.use(createErrorHandler({ logger }));

    const response = await request(app)
      .post("/try-it")
      .set("Host", "localhost:4300")
      .set("Origin", "http://localhost:4300")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:4300");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("still rejects a cross-origin request outside the allowlist", async () => {
    const app = express();

    app.use(
      createCorsMiddleware({
        allowedOrigins: ["http://localhost:5173"],
        credentials: true,
      }),
    );
    app.post("/try-it", (_request, response) => response.status(204).send());
    app.use(createErrorHandler({ logger }));

    await request(app)
      .post("/try-it")
      .set("Host", "localhost:4300")
      .set("Origin", "https://attacker.example")
      .expect(403);
  });

  it("applies strict API headers while allowing the docs router to replace its CSP", async () => {
    const app = express();

    app.use(...createSecurityMiddleware({ production: false }));
    app.get("/api", (_request, response) => response.json({ ok: true }));
    app.get("/docs", createDocsSecurityMiddleware(), (_request, response) =>
      response.type("html").send("<html></html>"),
    );

    const apiResponse = await request(app).get("/api").expect(200);
    expect(apiResponse.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(apiResponse.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(apiResponse.headers["x-frame-options"]).toBe("DENY");
    expect(apiResponse.headers["x-xss-protection"]).toBe("0");
    expect(apiResponse.headers["permissions-policy"]).toContain("magnetometer=()");

    const docsResponse = await request(app).get("/docs").expect(200);
    expect(docsResponse.headers["content-security-policy"]).toContain("https://cdn.jsdelivr.net");
    expect(docsResponse.headers["content-security-policy"]).not.toContain("default-src 'none'");
    expect(docsResponse.headers["x-frame-options"]).toBe("DENY");
  });

  it("joins HTTP paths without producing a double slash at the root prefix", () => {
    expect(joinHttpPath("/", "/auth")).toBe("/auth");
    expect(joinHttpPath("/api/v1/", "/auth")).toBe("/api/v1/auth");
  });

  it("propagates safe request IDs and records route templates", async () => {
    const metrics = createMetrics({
      serviceName: "test-api",
      collectDefaultMetrics: false,
    });
    openMetrics.push(metrics);
    const app = express();

    app.use(createRequestIdMiddleware());
    app.use(createHttpMetricsMiddleware(metrics));
    app.get("/users/:id", (_request, response) => {
      response.json({ ok: true });
    });

    const response = await request(app)
      .get("/users/a-real-user-id")
      .set("X-Request-Id", "client-request-123")
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("client-request-123");
    const exposition = await metrics.metrics();
    expect(exposition).toContain('route="/users/:id"');
    expect(exposition).not.toContain("a-real-user-id");
  });

  it("records and logs a socket close after end but before the response is flushed", () => {
    const finishHttpRequest = vi.fn();
    const metrics = {
      startHttpRequest: vi.fn(),
      finishHttpRequest,
    } as unknown as ApplicationMetrics;
    const accessLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;
    const requestStub = {
      method: "GET",
      originalUrl: "/failure",
      route: { path: "/failure" },
      routeBasePath: "",
      baseUrl: "",
      requestId: "request-123",
    } as unknown as Request;
    const responseStub = Object.assign(new EventEmitter(), {
      statusCode: 500,
      writableEnded: true,
      writableFinished: false,
      getHeader: vi.fn(() => "128"),
    }) as unknown as Response;

    createHttpMetricsMiddleware(metrics)(requestStub, responseStub, vi.fn());
    createRequestLoggerMiddleware(accessLogger)(requestStub, responseStub, vi.fn());
    responseStub.emit("close");
    responseStub.emit("finish");

    expect(finishHttpRequest).toHaveBeenCalledOnce();
    expect(finishHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        route: "/failure",
        statusCode: 499,
      }),
    );
    expect(accessLogger.warn).toHaveBeenCalledOnce();
    expect(accessLogger.warn).toHaveBeenCalledWith(
      "HTTP request rejected",
      expect.objectContaining({
        requestId: "request-123",
        statusCode: 499,
        aborted: true,
      }),
    );
  });

  it("returns a stable error envelope without a stack", async () => {
    const app = express();

    app.use(createRequestIdMiddleware({ acceptIncoming: false }));
    app.get("/failure", () => {
      throw new HttpError({
        statusCode: 409,
        code: "TEST_CONFLICT",
        message: "The resource conflicts.",
      });
    });
    app.use(notFoundHandler);
    app.use(createErrorHandler({ logger }));

    const response = await request(app).get("/failure").expect(409);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "TEST_CONFLICT",
        message: "The resource conflicts.",
      },
    });
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("stack");
    expect(logWarning).toHaveBeenCalledWith(
      "HTTP request handler rejected a request",
      expect.not.objectContaining({ error: expect.anything() }),
    );
  });

  it("logs the original error for unexpected server failures", async () => {
    const app = express();
    const failure = new Error("database connection failed");

    app.use(createRequestIdMiddleware({ acceptIncoming: false }));
    app.get("/failure", () => {
      throw failure;
    });
    app.use(createErrorHandler({ logger }));

    await request(app).get("/failure").expect(500);

    expect(logError).toHaveBeenCalledWith(
      "HTTP request handler failed",
      expect.objectContaining({ error: failure }),
    );
  });

  it("uses a low-cardinality label for unmatched routes", async () => {
    const metrics = createMetrics({
      serviceName: "test-api",
      collectDefaultMetrics: false,
    });
    openMetrics.push(metrics);
    const app = express();

    app.use(createRequestIdMiddleware());
    app.use(createHttpMetricsMiddleware(metrics));
    app.use(notFoundHandler);
    app.use(createErrorHandler({ logger }));

    await request(app).get("/unknown/unique-value").expect(404);

    const exposition = await metrics.metrics();
    expect(exposition).toContain('route="__unmatched__"');
    expect(exposition).not.toContain("unique-value");
  });

  it("normalizes an absent GET body to an empty object for request schemas", async () => {
    const app = express();

    app.use(createRequestIdMiddleware());
    app.get(
      "/bodyless",
      validateRequest(
        z.object({
          body: z.object({}),
          params: z.object({}),
          query: z.object({}),
          headers: z.object({}).passthrough(),
        }),
      ),
      (_request, response) => response.status(204).send(),
    );
    app.use(createErrorHandler({ logger }));

    await request(app).get("/bodyless").expect(204);
  });

  it("preserves body-parser client statuses for unsupported JSON charsets", async () => {
    const app = express();

    app.use(createRequestIdMiddleware({ acceptIncoming: false }));
    app.use(...createBodyParsers("10kb"));
    app.post("/json", (_request, response) => response.status(204).send());
    app.use(createErrorHandler({ logger }));

    const response = await request(app)
      .post("/json")
      .set("Content-Type", "application/json; charset=iso-8859-1")
      .send('{"value":"test"}')
      .expect(415);

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "The request body uses an unsupported media type or character encoding.",
      },
    });
    expect(logWarning).toHaveBeenCalledWith(
      "HTTP request handler rejected a request",
      expect.objectContaining({ statusCode: 415 }),
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it("counts successful public-auth requests but not successful logins", async () => {
    const app = express();
    const rateLimiters = createRateLimiters({
      windowMs: 60_000,
      apiLimit: 100,
      loginLimit: 1,
      refreshLimit: 1,
      publicAuthLimit: 1,
      monitoringLimit: 1,
      emailResendWindowMs: 60_000,
      emailResendIpLimit: 1,
      emailResendRecipientLimit: 1,
    });

    app.post("/forgot", rateLimiters.publicAuth, (_request, response) => {
      response.status(202).send();
    });
    app.post("/login/success", rateLimiters.login, (_request, response) => {
      response.status(200).send();
    });
    app.post("/login/failure", rateLimiters.login, (_request, response) => {
      response.status(401).send();
    });
    app.post("/refresh", rateLimiters.refresh, (_request, response) => {
      response.status(200).send();
    });
    app.post("/refresh/failure", rateLimiters.refresh, (_request, response) => {
      response.status(401).send();
    });

    await request(app).post("/forgot").expect(202);
    await request(app).post("/forgot").expect(429);
    await request(app).post("/login/success").expect(200);
    await request(app).post("/login/success").expect(200);
    await request(app).post("/login/failure").expect(401);
    await request(app).post("/login/failure").expect(429);
    await request(app).post("/refresh").expect(200);
    await request(app).post("/refresh").expect(200);
    await request(app).post("/refresh/failure").expect(401);
    await request(app).post("/refresh/failure").expect(429);
  });

  it("rate limits monitoring independently from API traffic", async () => {
    const app = express();
    const rateLimiters = createRateLimiters({
      windowMs: 60_000,
      apiLimit: 100,
      loginLimit: 100,
      refreshLimit: 100,
      publicAuthLimit: 100,
      monitoringLimit: 1,
      emailResendWindowMs: 60_000,
      emailResendIpLimit: 1,
      emailResendRecipientLimit: 1,
    });

    app.get("/monitoring/readiness", rateLimiters.monitoring, (_request, response) => {
      response.status(200).send();
    });

    await request(app).get("/monitoring/readiness").expect(200);
    await request(app).get("/monitoring/readiness").expect(429);
  });

  it("scopes verification resend limits to both client address and normalized recipient", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const rateLimiters = createRateLimiters({
      windowMs: 60_000,
      apiLimit: 100,
      loginLimit: 100,
      refreshLimit: 100,
      publicAuthLimit: 100,
      monitoringLimit: 100,
      emailResendWindowMs: 60_000,
      emailResendIpLimit: 2,
      emailResendRecipientLimit: 1,
    });

    app.use(express.json());
    app.post("/resend", ...rateLimiters.emailResend, (_request, response) => {
      response.status(202).send();
    });

    await request(app)
      .post("/resend")
      .set("X-Forwarded-For", "198.51.100.10")
      .send({ email: "Person@Example.com" })
      .expect(202);
    await request(app)
      .post("/resend")
      .set("X-Forwarded-For", "198.51.100.10")
      .send({ email: " person@example.com " })
      .expect(429);
    await request(app)
      .post("/resend")
      .set("X-Forwarded-For", "198.51.100.11")
      .send({ email: "person@example.com" })
      .expect(202);
    await request(app)
      .post("/resend")
      .set("X-Forwarded-For", "198.51.100.10")
      .send({ email: "other@example.com" })
      .expect(429);
  });
});
