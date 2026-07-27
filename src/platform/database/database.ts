import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import * as schema from "./schema.js";

export interface DatabaseConfig {
  connectionString: string;
  maxConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  statementTimeoutMs?: number;
  applicationName?: string;
  ssl?: PoolConfig["ssl"];
  onUnexpectedPoolError?: (error: Error) => void;
}

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  pool: Pool;
  ping(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_MAX_CONNECTIONS = 10;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * Creates the process-wide PostgreSQL pool and Drizzle client.
 * The composition root owns this object and must call close during shutdown.
 */
export function createDatabase(config: DatabaseConfig): DatabaseConnection {
  assertDatabaseConfig(config);

  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    max: config.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    statement_timeout: config.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    allowExitOnIdle: false,
    ...(config.applicationName ? { application_name: config.applicationName } : {}),
    ...(config.ssl === undefined ? {} : { ssl: config.ssl }),
  };
  const pool = new Pool(poolConfig);

  // node-postgres emits background-client failures through this event. Keeping
  // a listener installed prevents an EventEmitter "error" from crashing without
  // context; the composition root should provide a structured logger callback.
  pool.on("error", (error) => {
    if (config.onUnexpectedPoolError) {
      config.onUnexpectedPoolError(error);
      return;
    }

    process.emitWarning(error, {
      code: "POSTGRES_POOL_ERROR",
      detail: "An idle PostgreSQL client emitted an unexpected error",
    });
  });

  const db = drizzle({ client: pool, schema });
  let closed = false;

  return {
    db,
    pool,
    async ping(signal?: AbortSignal): Promise<void> {
      const client = await acquireClient(pool, signal);
      let discardClient = false;

      try {
        await raceWithAbort(client.query("select 1"), signal);
      } catch (error) {
        discardClient = signal?.aborted === true;
        throw error;
      } finally {
        // Passing an error removes the client from the pool. node-postgres
        // force-closes its socket when a query is active, so an aborted ping
        // cannot retain a shared pool slot.
        client.release(discardClient);
      }
    },
    async close(): Promise<void> {
      if (closed) {
        return;
      }

      closed = true;
      await pool.end();
    },
  };
}

async function acquireClient(pool: Pool, signal?: AbortSignal): Promise<PoolClient> {
  throwIfAborted(signal);

  if (signal === undefined) {
    return pool.connect();
  }

  return new Promise<PoolClient>((resolve, reject) => {
    let aborted = false;

    const onAbort = (): void => {
      aborted = true;
      reject(createAbortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    void pool.connect().then(
      (client) => {
        signal.removeEventListener("abort", onAbort);
        if (aborted) {
          client.release();
          return;
        }

        resolve(client);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (!aborted) {
          reject(error);
        }
      },
    );
  });
}

async function raceWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    // The query was created by the caller before this function received it.
    // Observe its eventual rejection after the client is discarded.
    void operation.catch(() => undefined);
    throw createAbortError(signal);
  }

  if (signal === undefined) {
    return operation;
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(createAbortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

function createAbortError(signal: AbortSignal): Error {
  const error = new Error("PostgreSQL ping was aborted", { cause: signal.reason });
  error.name = "AbortError";
  return error;
}

function assertDatabaseConfig(config: DatabaseConfig): void {
  if (!config.connectionString.trim()) {
    throw new Error("PostgreSQL connection string is required");
  }

  assertPositiveInteger(config.maxConnections, "maxConnections");
  assertPositiveInteger(config.connectionTimeoutMs, "connectionTimeoutMs");
  assertPositiveInteger(config.idleTimeoutMs, "idleTimeoutMs");
  assertPositiveInteger(config.statementTimeoutMs, "statementTimeoutMs");
}

function assertPositiveInteger(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new RangeError(`Database ${name} must be a positive integer`);
  }
}
