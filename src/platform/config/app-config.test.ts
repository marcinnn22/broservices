import { describe, expect, it } from "vitest";

import { ConfigValidationError, loadConfig } from "./app-config.js";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://app:password@localhost:5432/app_test",
  JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
  METRICS_BEARER_TOKEN: "metrics-token-that-is-at-least-32-characters",
};

describe("loadConfig", () => {
  it("parses typed defaults without mutating process.env", () => {
    const config = loadConfig(validEnvironment);

    expect(config.environment).toBe("test");
    expect(config.server.port).toBe(4300);
    expect(config.server.trustProxy).toBe(false);
    expect(config.cors.allowedOrigins).toEqual(["http://localhost:5173"]);
    expect(config.monitoring.metricsEnabled).toBe(true);
    expect(config.monitoring.readinessCacheTtlMs).toBe(1_000);
    expect(config.rateLimit.loginLimit).toBe(10);
    expect(config.rateLimit.refreshLimit).toBe(50);
    expect(config.rateLimit.emailResendIpLimit).toBe(3);
    expect(config.rateLimit.emailResendRecipientLimit).toBe(1);
    expect(config.docs.enabled).toBe(true);
    expect(config.mail.transport).toBe("log");
    expect(config.auth.accessTokenTtlSeconds).toBe(900);
    expect(config.auth.refreshSessionTtlMs).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(config.auth.refreshReuseGraceMs).toBe(5_000);
    expect(config.auth.accessTokenRotationGraceMs).toBe(30_000);
    expect(config.auth.emailRequestCooldownMs).toBe(20 * 60_000);
    expect(config.auth.webAppUrl).toBe("http://localhost:5173");
    expect(config.auth.passwordHash).toEqual({
      memoryCostKiB: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    expect(config.auth.refreshCookie.secure).toBe(false);
    expect(config.mail.socketTimeoutMs).toBe(5_000);
  });

  it("rejects credentials with a wildcard CORS origin", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        CORS_ORIGINS: "*",
        CORS_CREDENTIALS: "true",
      }),
    ).toThrow(/cannot contain "\*"/);
  });

  it("requires secure cookies when SameSite is none", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        REFRESH_COOKIE_SAME_SITE: "none",
        REFRESH_COOKIE_SECURE: "false",
      }),
    ).toThrow(/must be true/);
  });

  it("rejects a wildcard CORS origin when SameSite is none", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        CORS_ORIGINS: "*",
        CORS_CREDENTIALS: "false",
        REFRESH_COOKIE_SAME_SITE: "none",
        REFRESH_COOKIE_SECURE: "true",
      }),
    ).toThrow(/cannot contain "\*" when REFRESH_COOKIE_SAME_SITE is "none"/);
  });

  it("requires an explicit web application URL in production", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        NODE_ENV: "production",
        PUBLIC_URL: "https://api.example.com",
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.example.com",
      }),
    ).toThrow(/WEB_APP_URL/);

    expect(
      loadConfig({
        ...validEnvironment,
        NODE_ENV: "production",
        PUBLIC_URL: "https://api.example.com",
        WEB_APP_URL: "https://app.example.com/",
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.example.com",
      }).auth.webAppUrl,
    ).toBe("https://app.example.com");
  });

  it("requires a bearer token whenever metrics are enabled", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        METRICS_BEARER_TOKEN: "",
      }),
    ).toThrow(/METRICS_BEARER_TOKEN/);

    expect(
      loadConfig({
        ...validEnvironment,
        METRICS_ENABLED: "false",
        METRICS_BEARER_TOKEN: "",
      }).monitoring.metricsEnabled,
    ).toBe(false);
  });

  it("rejects zero-length or unsafe durations during validation", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        JWT_ACCESS_TTL: "0s",
      }),
    ).toThrow(ConfigValidationError);

    expect(() =>
      loadConfig({
        ...validEnvironment,
        JWT_ACCESS_TTL: "999999999999999999999d",
      }),
    ).toThrow(ConfigValidationError);
  });

  it("validates access-token durations before constructing runtime resources", () => {
    for (const JWT_ACCESS_TTL of ["30s", "500ms", "60500ms"]) {
      expect(() =>
        loadConfig({
          ...validEnvironment,
          JWT_ACCESS_TTL,
        }),
      ).toThrow(/JWT_ACCESS_TTL/);
    }

    expect(
      loadConfig({
        ...validEnvironment,
        JWT_ACCESS_TTL: "60s",
      }).auth.accessTokenTtlSeconds,
    ).toBe(60);
  });

  it("bounds the refresh reuse grace period", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        REFRESH_REUSE_GRACE: "31s",
      }),
    ).toThrow(/must not exceed 30s/);
  });

  it("rejects cleanup intervals that exceed Node's timer range", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        AUTH_CLEANUP_INTERVAL: "30d",
      }),
    ).toThrow(/AUTH_CLEANUP_INTERVAL/);
  });

  it("bounds access-token rotation grace by both policy and access-token lifetime", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        ACCESS_TOKEN_ROTATION_GRACE: "6m",
      }),
    ).toThrow(/ACCESS_TOKEN_ROTATION_GRACE/);

    expect(() =>
      loadConfig({
        ...validEnvironment,
        JWT_ACCESS_TTL: "1m",
        ACCESS_TOKEN_ROTATION_GRACE: "61s",
      }),
    ).toThrow(/ACCESS_TOKEN_ROTATION_GRACE/);
  });

  it("requires SMTP timeouts to fit within the graceful-shutdown budget", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.example.com",
        SHUTDOWN_TIMEOUT_MS: "5000",
        SMTP_SOCKET_TIMEOUT_MS: "5000",
      }),
    ).toThrow(/SMTP_SOCKET_TIMEOUT_MS/);
  });

  it("reports variable names without including secret values", () => {
    const secret = "short-private-value";

    try {
      loadConfig({
        ...validEnvironment,
        JWT_ACCESS_SECRET: secret,
      });
      throw new Error("Expected configuration parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect(String(error)).toContain("JWT_ACCESS_SECRET");
      expect(String(error)).not.toContain(secret);
    }
  });
});
