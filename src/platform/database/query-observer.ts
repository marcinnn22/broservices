import { performance } from "node:perf_hooks";

export type DatabaseOperation = "select" | "insert" | "update" | "delete" | "transaction";

export interface DatabaseQueryMetric {
  operation: DatabaseOperation;
  table: "users" | "auth_action_tokens" | "auth_email_requests" | "refresh_sessions";
  success: boolean;
  durationSeconds: number;
}

/**
 * Deliberately matches ApplicationMetrics structurally without making the
 * database package depend on the concrete observability implementation.
 */
export interface DatabaseQueryObserver {
  recordDatabaseQuery(metric: DatabaseQueryMetric): void;
}

export async function observeDatabaseQuery<T>(
  observer: DatabaseQueryObserver,
  labels: Pick<DatabaseQueryMetric, "operation" | "table">,
  query: () => PromiseLike<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await query();
    observer.recordDatabaseQuery({
      ...labels,
      success: true,
      durationSeconds: (performance.now() - startedAt) / 1_000,
    });
    return result;
  } catch (error) {
    observer.recordDatabaseQuery({
      ...labels,
      success: false,
      durationSeconds: (performance.now() - startedAt) / 1_000,
    });
    throw error;
  }
}
