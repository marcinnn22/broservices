import { describe, expect, it } from "vitest";

import { hasPostgresErrorCode } from "./postgres-error.js";

describe("hasPostgresErrorCode", () => {
  it("finds SQLSTATE values through wrapped error causes", () => {
    const postgresError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const drizzleError = new Error("Failed query", { cause: postgresError });

    expect(hasPostgresErrorCode(drizzleError, "23505")).toBe(true);
    expect(hasPostgresErrorCode(drizzleError, "23503")).toBe(false);
  });

  it("stops safely when an error cause graph is cyclic", () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;

    expect(hasPostgresErrorCode(cyclic, "23505")).toBe(false);
  });
});
