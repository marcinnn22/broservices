import type { Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "../platform/observability/index.js";
import { createGracefulShutdown } from "./shutdown.js";

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  flush: vi.fn(),
} satisfies Logger;

afterEach(() => {
  vi.useRealTimers();
});

describe("graceful shutdown", () => {
  it("closes resources even when HTTP server closure fails and allows a retry", async () => {
    const serverError = new Error("server close failed");
    const close = vi
      .fn()
      .mockImplementationOnce((callback: (error?: Error) => void) => callback(serverError))
      .mockImplementationOnce((callback: (error?: Error) => void) => callback());
    const closeResources = vi.fn().mockResolvedValue(undefined);
    const shutdown = createGracefulShutdown({
      server: {
        close,
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
      } as unknown as Server,
      timeoutMs: 1_000,
      logger,
      closeResources,
      forceExit: vi.fn(),
    });

    await expect(shutdown("first")).rejects.toBeInstanceOf(AggregateError);
    expect(closeResources).toHaveBeenCalledOnce();

    await expect(shutdown("retry")).resolves.toBeUndefined();
    expect(closeResources).toHaveBeenCalledTimes(2);
  });

  it("reserves resource-drain time before invoking the exit fallback for a hung server", async () => {
    vi.useFakeTimers();
    const closeAllConnections = vi.fn();
    const forceExit = vi.fn();
    let releaseResources: (() => void) | undefined;
    const closeResources = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseResources = resolve;
        }),
    );
    const shutdown = createGracefulShutdown({
      server: {
        close: vi.fn(),
        closeIdleConnections: vi.fn(),
        closeAllConnections,
      } as unknown as Server,
      timeoutMs: 100,
      logger,
      closeResources,
      forceExit,
    });

    const result = shutdown("timeout-test");
    const expectedRejection = expect(result).rejects.toThrow(/shutdown steps failed/);

    await vi.advanceTimersByTimeAsync(50);
    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(closeResources).toHaveBeenCalledOnce();
    expect(forceExit).not.toHaveBeenCalled();

    releaseResources?.();
    await expectedRejection;
    expect(forceExit).toHaveBeenCalledWith(1);
  });

  it("bounds a hung resource drain with the total shutdown deadline", async () => {
    vi.useFakeTimers();
    const forceExit = vi.fn();
    const closeResources = vi.fn(() => new Promise<void>(() => undefined));
    const shutdown = createGracefulShutdown({
      server: {
        close: vi.fn((callback: (error?: Error) => void) => callback()),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
      } as unknown as Server,
      timeoutMs: 100,
      logger,
      closeResources,
      forceExit,
    });

    const result = shutdown("resource-timeout-test");
    const expectedRejection = expect(result).rejects.toThrow(/shutdown steps failed/);

    await vi.advanceTimersByTimeAsync(100);
    await expectedRejection;
    expect(closeResources).toHaveBeenCalledOnce();
    expect(forceExit).toHaveBeenCalledWith(1);
  });
});
