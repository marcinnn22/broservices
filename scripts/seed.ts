import { z } from "zod";

import { Argon2PasswordHasher, assertPasswordMeetsPolicy } from "../src/modules/auth/index.js";
import { normalizeEmail, normalizeUserName } from "../src/modules/users/index.js";
import { users } from "../src/modules/users/infrastructure/postgres/users.schema.js";
import { createDatabase } from "../src/platform/database/index.js";
import { createLogger } from "../src/platform/observability/index.js";

try {
  process.loadEnvFile();
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

const seedEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_NAME: z.string().min(2).max(100),
  SEED_ADMIN_PASSWORD: z.string().min(1),
  ARGON2_MEMORY_COST_KIB: z.coerce.number().int().min(8_192).max(1_048_576).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).max(10).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1),
});

const logger = createLogger({
  serviceName: "database-seed",
  serviceVersion: "1",
  environment: "development",
  level: "info",
  pretty: true,
});

async function seed(): Promise<void> {
  const environment = seedEnvironmentSchema.parse(process.env);
  const database = createDatabase({
    connectionString: environment.DATABASE_URL,
    applicationName: "database-seed",
    onUnexpectedPoolError: (error) => logger.error("PostgreSQL pool error", { error }),
  });

  try {
    assertPasswordMeetsPolicy(environment.SEED_ADMIN_PASSWORD);
    const passwordHash = await new Argon2PasswordHasher({
      memoryCostKiB: environment.ARGON2_MEMORY_COST_KIB,
      timeCost: environment.ARGON2_TIME_COST,
      parallelism: environment.ARGON2_PARALLELISM,
    }).hash(environment.SEED_ADMIN_PASSWORD);
    const [created] = await database.db
      .insert(users)
      .values({
        email: normalizeEmail(environment.SEED_ADMIN_EMAIL),
        name: normalizeUserName(environment.SEED_ADMIN_NAME),
        passwordHash,
        role: "admin",
        emailVerifiedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email });

    if (created === undefined) {
      logger.warn("Admin seed skipped because the email already exists", {
        email: normalizeEmail(environment.SEED_ADMIN_EMAIL),
      });
      return;
    }

    logger.info("Admin seed created", created);
  } finally {
    await database.close();
  }
}

void seed()
  .catch((error: unknown) => {
    logger.error("Database seed failed", { error });
    process.exitCode = 1;
  })
  .finally(() => {
    logger.flush();
  });
