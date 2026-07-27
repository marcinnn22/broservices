import { performance } from "node:perf_hooks";

import type { Logger } from "../../../platform/observability/logger.js";

export interface ReadinessCheck {
  /**
   * A stable, low-cardinality dependency name such as "postgres".
   */
  readonly name: string;
  check(signal: AbortSignal): Promise<void>;
}

export interface ReadinessCheckResult {
  readonly status: "up" | "down";
  readonly durationMs: number;
}

export interface ReadinessReport {
  readonly status: "ready" | "not_ready";
  readonly timestamp: string;
  readonly checks: Readonly<Record<string, ReadinessCheckResult>>;
}

export interface LivenessReport {
  readonly status: "ok";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
}

export interface HealthService {
  liveness(): LivenessReport;
  readiness(): Promise<ReadinessReport>;
}

class ReadinessTimeoutError extends Error {
  constructor(checkName: string, timeoutMs: number) {
    super(`Readiness check "${checkName}" exceeded ${timeoutMs}ms`);
    this.name = "ReadinessTimeoutError";
  }
}

const runWithTimeout = async (check: ReadinessCheck, timeoutMs: number): Promise<void> => {
  const abortController = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      abortController.abort();
      reject(new ReadinessTimeoutError(check.name, timeoutMs));
    }, timeoutMs);
    timeout.unref();
  });

  try {
    await Promise.race([check.check(abortController.signal), timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

export function createHealthService(options: {
  readonly checks?: readonly ReadinessCheck[];
  readonly timeoutMs: number;
  readonly cacheTtlMs?: number;
  readonly logger: Logger;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly uptime?: () => number;
}): HealthService {
  const checks = options.checks ?? [];
  const checkNames = new Set<string>();

  for (const check of checks) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(check.name)) {
      throw new Error(`Readiness check name "${check.name}" must be a stable lowercase identifier`);
    }

    if (checkNames.has(check.name)) {
      throw new Error(`Duplicate readiness check name "${check.name}"`);
    }

    checkNames.add(check.name);
  }

  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const uptime = options.uptime ?? (() => process.uptime());
  const cacheTtlMs = options.cacheTtlMs ?? 1_000;
  let cached: { readonly expiresAt: number; readonly report: ReadinessReport } | undefined;
  let inFlight: Promise<ReadinessReport> | undefined;

  const runReadinessChecks = async (): Promise<ReadinessReport> => {
    const results = await Promise.all(
      checks.map(async (check) => {
        const startedAt = performance.now();

        try {
          await runWithTimeout(check, options.timeoutMs);

          return [
            check.name,
            {
              status: "up",
              durationMs: Number((performance.now() - startedAt).toFixed(2)),
            },
          ] as const;
        } catch (error) {
          const durationMs = Number((performance.now() - startedAt).toFixed(2));
          options.logger.warn("Readiness check failed", {
            check: check.name,
            durationMs,
            error,
          });

          return [
            check.name,
            {
              status: "down",
              durationMs,
            },
          ] as const;
        }
      }),
    );
    const resultByName = Object.fromEntries(results);
    const ready = results.every(([, result]) => result.status === "up");

    return {
      status: ready ? "ready" : "not_ready",
      timestamp: now().toISOString(),
      checks: resultByName,
    };
  };

  return {
    liveness(): LivenessReport {
      return {
        status: "ok",
        timestamp: now().toISOString(),
        uptimeSeconds: Number(uptime().toFixed(3)),
      };
    },

    readiness(): Promise<ReadinessReport> {
      const currentTime = monotonicNow();

      if (cached !== undefined && currentTime < cached.expiresAt) {
        return Promise.resolve(cached.report);
      }

      if (inFlight !== undefined) {
        return inFlight;
      }

      const pending = runReadinessChecks()
        .then((report) => {
          cached = {
            report,
            expiresAt: monotonicNow() + cacheTtlMs,
          };
          return report;
        })
        .finally(() => {
          if (inFlight === pending) {
            inFlight = undefined;
          }
        });

      inFlight = pending;
      return pending;
    },
  };
}
