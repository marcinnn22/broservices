import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../../../platform/observability/logger.js";
import { createHealthService, type ReadinessCheck } from "./health-service.js";

const createLogger = (): Logger =>
  ({
    warn: vi.fn(),
  }) as unknown as Logger;

describe("createHealthService", () => {
  it("reports ready only when every dependency check succeeds", async () => {
    const checks: ReadinessCheck[] = [
      {
        name: "postgres",
        async check(): Promise<void> {},
      },
      {
        name: "smtp",
        async check(): Promise<void> {
          throw new Error("offline");
        },
      },
    ];
    const health = createHealthService({
      checks,
      timeoutMs: 100,
      logger: createLogger(),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(health.readiness()).resolves.toMatchObject({
      status: "not_ready",
      timestamp: "2026-01-01T00:00:00.000Z",
      checks: {
        postgres: { status: "up" },
        smtp: { status: "down" },
      },
    });
  });

  it("bounds a readiness check with a timeout", async () => {
    const health = createHealthService({
      checks: [
        {
          name: "postgres",
          async check(): Promise<void> {
            await new Promise(() => undefined);
          },
        },
      ],
      timeoutMs: 5,
      logger: createLogger(),
    });

    await expect(health.readiness()).resolves.toMatchObject({
      status: "not_ready",
      checks: {
        postgres: { status: "down" },
      },
    });
  });

  it("coalesces concurrent checks and caches the result for a short interval", async () => {
    let monotonicTime = 1_000;
    let releaseCheck: (() => void) | undefined;
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCheck = resolve;
        }),
    );
    const health = createHealthService({
      checks: [{ name: "postgres", check }],
      timeoutMs: 100,
      cacheTtlMs: 1_000,
      monotonicNow: () => monotonicTime,
      logger: createLogger(),
    });

    const first = health.readiness();
    const concurrent = health.readiness();
    releaseCheck?.();

    await Promise.all([first, concurrent]);
    await health.readiness();

    expect(check).toHaveBeenCalledOnce();

    monotonicTime = 2_001;
    const afterExpiry = health.readiness();
    releaseCheck?.();
    await afterExpiry;

    expect(check).toHaveBeenCalledTimes(2);
  });
});
