import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  authActionTokens,
  authEmailRequests,
} from "../modules/auth/infrastructure/postgres/auth.schema.js";
import { users } from "../modules/users/infrastructure/postgres/users.schema.js";
import { type AppConfig, loadConfig } from "../platform/config/index.js";
import { createDatabase, type DatabaseConnection } from "../platform/database/index.js";
import { createCompositionRoot } from "./composition-root.js";

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!runIntegrationTests)("composition root integration", () => {
  let observer: DatabaseConnection;

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl === undefined) {
      throw new Error("DATABASE_URL is required when RUN_INTEGRATION_TESTS=true");
    }

    observer = createDatabase({
      connectionString: databaseUrl,
      applicationName: "composition-root-test-observer",
    });
  });

  afterAll(async () => {
    await observer?.close();
  });

  it("closes the PostgreSQL pool when a later startup step throws", async () => {
    const serviceName = `startup-cleanup-${crypto.randomUUID()}`;
    const config = testConfig(serviceName);
    const invalidWorkerConfig: AppConfig = {
      ...config,
      auth: {
        ...config.auth,
        emailWorkerPollIntervalMs: 0,
      },
    };

    await expect(createCompositionRoot(invalidWorkerConfig)).rejects.toThrow(
      /Scheduler interval must be a positive integer/,
    );

    const connections = await observer.pool.query<{ count: string }>(
      "select count(*)::text as count from pg_stat_activity where application_name = $1",
      [serviceName],
    );
    expect(connections.rows[0]?.count).toBe("0");
  });

  it("processes the initial authentication-email backlog before returning", async () => {
    const suffix = crypto.randomUUID();
    const serviceName = `startup-backlog-${suffix}`;
    const email = `startup-backlog-${suffix}@example.com`;
    const now = new Date();
    const [user] = await observer.db
      .insert(users)
      .values({
        email,
        name: "Startup Backlog",
        passwordHash: "not-used-by-integration-test",
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create startup-backlog test user");
    }

    const [emailRequest] = await observer.db
      .insert(authEmailRequests)
      .values({
        email,
        purpose: "email_verification",
        availableAt: now,
        createdAt: now,
      })
      .returning();

    if (!emailRequest) {
      throw new Error("Failed to create startup-backlog email request");
    }

    let runtime: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;

    try {
      runtime = await createCompositionRoot(testConfig(serviceName));

      const [completedRequest] = await observer.db
        .select()
        .from(authEmailRequests)
        .where(eq(authEmailRequests.id, emailRequest.id))
        .limit(1);
      const [verificationToken] = await observer.db
        .select({ id: authActionTokens.id })
        .from(authActionTokens)
        .where(eq(authActionTokens.userId, user.id))
        .limit(1);

      expect(completedRequest?.completedAt).toBeInstanceOf(Date);
      expect(verificationToken?.id).toEqual(expect.any(String));
    } finally {
      await runtime?.close();
      await observer.db.delete(authEmailRequests).where(eq(authEmailRequests.id, emailRequest.id));
      await observer.db.delete(users).where(eq(users.id, user.id));
    }
  });
});

const testConfig = (serviceName: string): AppConfig => {
  const config = loadConfig();

  return {
    ...config,
    logging: {
      ...config.logging,
      silent: true,
    },
    monitoring: {
      ...config.monitoring,
      serviceName,
    },
    mail: {
      ...config.mail,
      transport: "log",
    },
  };
};
