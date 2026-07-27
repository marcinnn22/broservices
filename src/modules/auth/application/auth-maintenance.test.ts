import { describe, expect, it, vi } from "vitest";

import { createAuthMaintenance } from "./auth-maintenance.js";

describe("auth maintenance", () => {
  it("deletes expired sessions and action tokens using one shared cutoff", async () => {
    const now = new Date("2026-07-26T08:00:00.000Z");
    const refreshSessions = { deleteExpired: vi.fn().mockResolvedValue(7) };
    const actionTokens = { deleteExpired: vi.fn().mockResolvedValue(3) };
    const onCompleted = vi.fn();
    const maintenance = createAuthMaintenance({
      refreshSessions,
      actionTokens,
      clock: { now: () => now },
      intervalMs: 60_000,
      onCompleted,
    });

    await expect(maintenance.run()).resolves.toEqual({
      refreshSessionsDeleted: 7,
      actionTokensDeleted: 3,
    });
    expect(refreshSessions.deleteExpired).toHaveBeenCalledWith(now);
    expect(actionTokens.deleteExpired).toHaveBeenCalledWith(now);
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("coalesces overlapping cleanup runs", async () => {
    let release: (() => void) | undefined;
    const refreshSessions = {
      deleteExpired: vi.fn(
        () =>
          new Promise<number>((resolve) => {
            release = () => resolve(1);
          }),
      ),
    };
    const actionTokens = { deleteExpired: vi.fn().mockResolvedValue(0) };
    const maintenance = createAuthMaintenance({
      refreshSessions,
      actionTokens,
      clock: { now: () => new Date() },
      intervalMs: 60_000,
    });

    const first = maintenance.run();
    const overlapping = maintenance.run();
    release?.();

    await Promise.all([first, overlapping]);
    expect(refreshSessions.deleteExpired).toHaveBeenCalledOnce();
    expect(actionTokens.deleteExpired).toHaveBeenCalledOnce();
  });
});
