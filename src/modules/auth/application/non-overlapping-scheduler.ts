export interface NonOverlappingScheduler<Result> {
  run(): Promise<Result>;
  start(): void;
  close(): Promise<void>;
}

const maximumTimerDelayMs = 2_147_483_647;

export function createNonOverlappingScheduler<Result>(options: {
  readonly task: () => Promise<Result>;
  readonly intervalMs: number;
  readonly onError?: (error: unknown) => void;
}): NonOverlappingScheduler<Result> {
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0) {
    throw new RangeError("Scheduler interval must be a positive integer");
  }
  if (options.intervalMs > maximumTimerDelayMs) {
    throw new RangeError(`Scheduler interval must not exceed ${maximumTimerDelayMs}ms`);
  }

  let interval: NodeJS.Timeout | undefined;
  let activeRun: Promise<Result> | undefined;

  const reportError = (error: unknown): void => {
    try {
      options.onError?.(error);
    } catch {
      // Observability must not change scheduler state.
    }
  };

  const run = (): Promise<Result> => {
    if (activeRun !== undefined) {
      return activeRun;
    }

    let pending: Promise<Result>;
    try {
      pending = options.task();
    } catch (error) {
      pending = Promise.reject(error);
    }

    activeRun = pending;
    void pending.then(
      () => {
        if (activeRun === pending) {
          activeRun = undefined;
        }
      },
      (error: unknown) => {
        if (activeRun === pending) {
          activeRun = undefined;
        }

        reportError(error);
      },
    );

    return pending;
  };

  return {
    run,

    start(): void {
      if (interval !== undefined) {
        return;
      }

      interval = setInterval(() => {
        void run().catch(() => undefined);
      }, options.intervalMs);
      interval.unref();
    },

    async close(): Promise<void> {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }

      await activeRun?.catch(() => undefined);
    },
  };
}
