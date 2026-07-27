import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    on: vi.fn(),
    connect: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
  const Pool = vi.fn(function MockPool() {
    return pool;
  });

  return { client, pool, Pool };
});

vi.mock("pg", () => ({ Pool: databaseMocks.Pool }));

import { createDatabase } from "./database.js";

beforeEach(() => {
  vi.clearAllMocks();
  databaseMocks.Pool.mockImplementation(function MockPool() {
    return databaseMocks.pool;
  });
  databaseMocks.pool.connect.mockResolvedValue(databaseMocks.client);
  databaseMocks.pool.end.mockResolvedValue(undefined);
});

describe("database readiness ping", () => {
  it("discards a client whose query is aborted", async () => {
    const abortController = new AbortController();
    databaseMocks.client.query.mockImplementation(() => new Promise(() => undefined));
    const database = createDatabase({
      connectionString: "postgresql://app:password@localhost:5432/app",
    });

    const ping = database.ping(abortController.signal);
    await vi.waitFor(() => expect(databaseMocks.client.query).toHaveBeenCalledWith("select 1"));
    abortController.abort();

    await expect(ping).rejects.toMatchObject({ name: "AbortError" });
    expect(databaseMocks.client.release).toHaveBeenCalledWith(true);
  });

  it("releases a client acquired after the ping was already aborted", async () => {
    const abortController = new AbortController();
    let finishAcquire: ((client: typeof databaseMocks.client) => void) | undefined;
    databaseMocks.pool.connect.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAcquire = resolve;
        }),
    );
    const database = createDatabase({
      connectionString: "postgresql://app:password@localhost:5432/app",
    });

    const ping = database.ping(abortController.signal);
    abortController.abort();
    await expect(ping).rejects.toMatchObject({ name: "AbortError" });

    finishAcquire?.(databaseMocks.client);
    await vi.waitFor(() => expect(databaseMocks.client.release).toHaveBeenCalledOnce());
    expect(databaseMocks.client.query).not.toHaveBeenCalled();
  });
});
