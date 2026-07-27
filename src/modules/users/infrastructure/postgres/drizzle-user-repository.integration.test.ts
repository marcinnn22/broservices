import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type DatabaseConnection } from "../../../../platform/database/index.js";
import {
  type ApplicationMetrics,
  createMetrics,
} from "../../../../platform/observability/index.js";
import { DuplicateUserEmailError } from "../../domain/user.errors.js";
import { DrizzleUserRepository } from "./drizzle-user-repository.js";
import { users } from "./users.schema.js";

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!runIntegrationTests)("DrizzleUserRepository integration", () => {
  let database: DatabaseConnection;
  let metrics: ApplicationMetrics;

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl === undefined) {
      throw new Error("DATABASE_URL is required when RUN_INTEGRATION_TESTS=true");
    }

    database = createDatabase({
      connectionString: databaseUrl,
      applicationName: "repository-integration-test",
    });
    metrics = createMetrics({
      serviceName: "repository-integration-test",
      collectDefaultMetrics: false,
    });
  });

  afterAll(async () => {
    metrics?.close();
    await database?.close();
  });

  it("persists, queries, and updates a user through the repository boundary", async () => {
    const repository = new DrizzleUserRepository(database.db, metrics);
    const email = `integration-${crypto.randomUUID()}@example.com`;
    const created = await repository.create({
      email,
      name: "Integration User",
      passwordHash: "$2b$12$integration-test-placeholder-hash",
    });

    try {
      expect(await repository.findByEmail(email)).toMatchObject({
        id: created.id,
        email,
        role: "user",
        status: "active",
      });

      const updated = await repository.updateName(
        created.id,
        "Updated Integration User",
        new Date(),
      );
      expect(updated?.name).toBe("Updated Integration User");

      const page = await repository.list({
        page: 1,
        pageSize: 10,
        search: email,
      });
      expect(page.items.some((user) => user.id === created.id)).toBe(true);
    } finally {
      await database.db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("maps a wrapped concurrent unique violation to DuplicateUserEmailError", async () => {
    const repository = new DrizzleUserRepository(database.db, metrics);
    const email = `concurrent-registration-${crypto.randomUUID()}@example.com`;
    const input = {
      email,
      name: "Concurrent Registration",
      passwordHash: "$2b$12$integration-test-placeholder-hash",
    };

    try {
      const results = await Promise.allSettled([
        repository.create(input),
        repository.create(input),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.find((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      if (rejected?.status !== "rejected") {
        throw new Error("Expected one concurrent user insert to be rejected");
      }
      expect(rejected.reason).toBeInstanceOf(DuplicateUserEmailError);
    } finally {
      await database.db.delete(users).where(eq(users.email, email));
    }
  });

  it("serializes concurrent cross-demotions and revalidates the acting admin", async () => {
    const repository = new DrizzleUserRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const firstAdmin = await repository.create({
      email: `admin-a-${suffix}@example.com`,
      name: "Integration Admin A",
      passwordHash: "$2b$12$integration-test-placeholder-hash",
      role: "admin",
    });
    const secondAdmin = await repository.create({
      email: `admin-b-${suffix}@example.com`,
      name: "Integration Admin B",
      passwordHash: "$2b$12$integration-test-placeholder-hash",
      role: "admin",
    });
    const ids = [firstAdmin.id, secondAdmin.id];

    try {
      const results = await Promise.allSettled([
        repository.changeRole(firstAdmin.id, secondAdmin.id, "user", new Date()),
        repository.changeRole(secondAdmin.id, firstAdmin.id, "user", new Date()),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        code: "USER_OPERATION_FORBIDDEN",
      });

      const persisted = await Promise.all(ids.map((id) => repository.findById(id)));
      expect(persisted.filter((candidate) => candidate?.role === "admin")).toHaveLength(1);
    } finally {
      await database.db.delete(users).where(inArray(users.id, ids));
    }
  });

  it("allows self-demotion when another active administrator remains", async () => {
    const repository = new DrizzleUserRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const firstAdmin = await repository.create({
      email: `self-demote-a-${suffix}@example.com`,
      name: "Self Demote Admin A",
      passwordHash: "integration-test-placeholder-hash",
      role: "admin",
    });
    const secondAdmin = await repository.create({
      email: `self-demote-b-${suffix}@example.com`,
      name: "Self Demote Admin B",
      passwordHash: "integration-test-placeholder-hash",
      role: "admin",
    });
    const ids = [firstAdmin.id, secondAdmin.id];

    try {
      await expect(
        repository.changeRole(firstAdmin.id, firstAdmin.id, "user", new Date()),
      ).resolves.toMatchObject({
        id: firstAdmin.id,
        role: "user",
      });
      await expect(repository.findById(secondAdmin.id)).resolves.toMatchObject({
        role: "admin",
        status: "active",
      });
    } finally {
      await database.db.delete(users).where(inArray(users.id, ids));
    }
  });

  it("allows self-disable when another active administrator remains", async () => {
    const repository = new DrizzleUserRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const firstAdmin = await repository.create({
      email: `self-disable-a-${suffix}@example.com`,
      name: "Self Disable Admin A",
      passwordHash: "integration-test-placeholder-hash",
      role: "admin",
    });
    const secondAdmin = await repository.create({
      email: `self-disable-b-${suffix}@example.com`,
      name: "Self Disable Admin B",
      passwordHash: "integration-test-placeholder-hash",
      role: "admin",
    });
    const ids = [firstAdmin.id, secondAdmin.id];

    try {
      await expect(
        repository.changeStatus(firstAdmin.id, firstAdmin.id, "disabled", new Date()),
      ).resolves.toMatchObject({
        id: firstAdmin.id,
        status: "disabled",
      });
      await expect(repository.findById(secondAdmin.id)).resolves.toMatchObject({
        role: "admin",
        status: "active",
      });
    } finally {
      await database.db.delete(users).where(inArray(users.id, ids));
    }
  });
});
