import { afterEach, describe, expect, it, vi } from "vitest";

import { createNonOverlappingScheduler } from "./non-overlapping-scheduler.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("non-overlapping scheduler", () => {
  it("rejects intervals that Node would clamp to one millisecond", () => {
    expect(() =>
      createNonOverlappingScheduler({
        task: async () => undefined,
        intervalMs: 30 * 24 * 60 * 60_000,
      }),
    ).toThrow(/must not exceed 2147483647ms/);
  });

  it("returns one shared promise for overlapping runs and permits the next run", async () => {
    let release: ((value: number) => void) | undefined;
    const task = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
    );
    const scheduler = createNonOverlappingScheduler({
      task,
      intervalMs: 1_000,
    });

    const first = scheduler.run();
    const overlapping = scheduler.run();

    expect(overlapping).toBe(first);
    await vi.waitFor(() => expect(task).toHaveBeenCalledOnce());
    release?.(1);
    await expect(first).resolves.toBe(1);

    const next = scheduler.run();
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2));
    release?.(2);
    await expect(next).resolves.toBe(2);
  });

  it("reports interval failures and continues scheduling", async () => {
    vi.useFakeTimers();
    const failure = new Error("scheduled task failed");
    const task = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = createNonOverlappingScheduler({
      task,
      intervalMs: 1_000,
      onError,
    });

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(task).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
    await scheduler.close();
  });
});
