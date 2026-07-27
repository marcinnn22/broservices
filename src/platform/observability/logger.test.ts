import { describe, expect, it } from "vitest";

import { createLogger, sanitizeLogMetadata } from "./logger.js";

describe("sanitizeLogMetadata", () => {
  it("redacts secrets recursively before metadata reaches the log transport", () => {
    const metadata = sanitizeLogMetadata({
      password: "do-not-log",
      actionToken: "do-not-log",
      refreshTokenHash: "do-not-log",
      headers: {
        authorization: "Bearer secret",
        cookie: "session=secret",
      },
      requestUrl: "/reset?token=private&returnTo=%2Faccount",
      safe: "visible",
    });

    expect(metadata).toEqual({
      password: "[REDACTED]",
      actionToken: "[REDACTED]",
      refreshTokenHash: "[REDACTED]",
      headers: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
      },
      requestUrl: "/reset?token=%5BREDACTED%5D&returnTo=%2Faccount",
      safe: "visible",
    });
  });

  it("serializes nested Error objects without losing their stack", () => {
    const error = new Error("database unavailable");
    const metadata = sanitizeLogMetadata({ error });

    expect(metadata).toEqual({
      error: {
        name: "Error",
        message: "database unavailable",
        stack: expect.any(String),
      },
    });
  });

  it("redacts Drizzle parameters embedded in error messages, stacks, and causes", () => {
    const passwordHash = "$2b$12$complete-private-password-hash";
    const tokenHash = "a".repeat(64);
    const queryFailure = new Error(
      `Failed query: insert into users values ($1, $2, $3)\nparams: person@example.com,Test Person,${passwordHash}`,
      {
        cause: new Error(`update auth_action_tokens\nparameters: ${tokenHash}`),
      },
    );
    queryFailure.stack = `${queryFailure.name}: ${queryFailure.message}\n    at executeQuery (db.ts:1:1)`;

    const metadata = sanitizeLogMetadata({
      error: queryFailure,
      params: ["person@example.com", passwordHash],
      summary: queryFailure.message,
    });
    const serialized = JSON.stringify(metadata);

    expect(metadata).toMatchObject({
      error: {
        message: expect.stringContaining("params: [REDACTED]"),
        stack: expect.stringContaining("params: [REDACTED]"),
        cause: {
          message: expect.stringContaining("parameters: [REDACTED]"),
        },
      },
      params: "[REDACTED]",
      summary: expect.stringContaining("params: [REDACTED]"),
    });
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain(passwordHash);
    expect(serialized).not.toContain(tokenHash);
  });

  it("distinguishes shared references from actual cycles", () => {
    const shared = { safe: "visible" };
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(
      sanitizeLogMetadata({
        before: shared,
        after: shared,
        circular,
      }),
    ).toEqual({
      before: { safe: "visible" },
      after: { safe: "visible" },
      circular: { self: "[Circular]" },
    });
  });

  it("does not inspect metadata for a disabled log level", () => {
    const logger = createLogger({
      serviceName: "logger-test",
      serviceVersion: "1.0.0",
      environment: "test",
      level: "error",
      pretty: false,
    });
    const metadata = Object.defineProperty({}, "expensive", {
      enumerable: true,
      get(): never {
        throw new Error("metadata should not be inspected");
      },
    });

    expect(() => logger.debug("discarded debug entry", metadata)).not.toThrow();
    logger.flush();
  });
});
