import { describe, expect, it, vi } from "vitest";
import {
  type DatabaseQueryMetric,
  type DatabaseQueryObserver,
  observeDatabaseQuery,
} from "./query-observer.js";

describe("database query observer", () => {
  it("records successful operations with bounded labels", async () => {
    const metrics: DatabaseQueryMetric[] = [];
    const observer: DatabaseQueryObserver = {
      recordDatabaseQuery: (metric) => metrics.push(metric),
    };

    await expect(
      observeDatabaseQuery(observer, { operation: "select", table: "users" }, async () => "result"),
    ).resolves.toBe("result");

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      operation: "select",
      table: "users",
      success: true,
    });
    expect(metrics[0]?.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it("records failed operations and preserves the original error", async () => {
    const recordDatabaseQuery = vi.fn();
    const observer: DatabaseQueryObserver = { recordDatabaseQuery };
    const failure = new Error("database unavailable");

    await expect(
      observeDatabaseQuery(
        observer,
        { operation: "transaction", table: "refresh_sessions" },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(recordDatabaseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "transaction",
        table: "refresh_sessions",
        success: false,
      }),
    );
  });
});
