import { createNonOverlappingScheduler } from "./non-overlapping-scheduler.js";
import type { Clock } from "./ports/clock.js";

export interface ExpiredAuthRecordRepository {
  deleteExpired(before: Date): Promise<number>;
}

export interface AuthMaintenanceResult {
  readonly refreshSessionsDeleted: number;
  readonly actionTokensDeleted: number;
}

export interface AuthMaintenance {
  run(): Promise<AuthMaintenanceResult>;
  start(): void;
  close(): Promise<void>;
}

export function createAuthMaintenance(options: {
  readonly refreshSessions: ExpiredAuthRecordRepository;
  readonly actionTokens: ExpiredAuthRecordRepository;
  readonly clock: Clock;
  readonly intervalMs: number;
  readonly onCompleted?: (result: AuthMaintenanceResult) => void;
  readonly onError?: (error: unknown) => void;
}): AuthMaintenance {
  const execute = async (): Promise<AuthMaintenanceResult> => {
    const before = options.clock.now();
    const [refreshSessionsDeleted, actionTokensDeleted] = await Promise.all([
      options.refreshSessions.deleteExpired(before),
      options.actionTokens.deleteExpired(before),
    ]);
    const result = { refreshSessionsDeleted, actionTokensDeleted };

    options.onCompleted?.(result);
    return result;
  };

  return createNonOverlappingScheduler({
    task: execute,
    intervalMs: options.intervalMs,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
}
