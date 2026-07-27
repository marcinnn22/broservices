import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type DatabaseConnection } from "../../../../platform/database/index.js";
import {
  type ApplicationMetrics,
  createMetrics,
} from "../../../../platform/observability/index.js";
import { users } from "../../../users/infrastructure/postgres/users.schema.js";
import { authActionTokens, authEmailRequests, refreshSessions } from "./auth.schema.js";
import { DrizzleAuthActionTokenRepository } from "./drizzle-auth-action-token-repository.js";
import { DrizzleAuthEmailRequestRepository } from "./drizzle-auth-email-request-repository.js";
import { DrizzleRefreshSessionRepository } from "./drizzle-refresh-session-repository.js";

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!runIntegrationTests)("auth repository integration", () => {
  let database: DatabaseConnection;
  let metrics: ApplicationMetrics;

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl === undefined) {
      throw new Error("DATABASE_URL is required when RUN_INTEGRATION_TESTS=true");
    }

    database = createDatabase({
      connectionString: databaseUrl,
      applicationName: "auth-repository-integration-test",
    });
    metrics = createMetrics({
      serviceName: "auth-repository-integration-test",
      collectDefaultMetrics: false,
    });
  });

  afterAll(async () => {
    metrics?.close();
    await database?.close();
  });

  it("leaves a disabled user's verification token unconsumed", async () => {
    const repository = new DrizzleAuthActionTokenRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const email = `disabled-verification-${suffix}@example.com`;
    const [user] = await database.db
      .insert(users)
      .values({
        email,
        name: "Disabled Verification",
        passwordHash: "not-used-by-integration-test",
        status: "disabled",
        disabledAt: new Date(),
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create integration user");
    }

    const tokenHash = createHash("sha256").update(suffix).digest("hex");
    const now = new Date();
    const token = await repository.replace({
      userId: user.id,
      purpose: "email_verification",
      tokenHash,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });

    try {
      await expect(repository.consumeEmailVerification(tokenHash, now)).resolves.toEqual({
        outcome: "disabled",
      });

      const [persistedToken] = await database.db
        .select()
        .from(authActionTokens)
        .where(eq(authActionTokens.id, token.id))
        .limit(1);
      const [persistedUser] = await database.db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      expect(persistedToken?.consumedAt).toBeNull();
      expect(persistedUser?.emailVerifiedAt).toBeNull();
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("idempotently preserves an action token when email preparation retries", async () => {
    const repository = new DrizzleAuthActionTokenRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const now = new Date();
    const [user] = await database.db
      .insert(users)
      .values({
        email: `idempotent-action-token-${suffix}@example.com`,
        name: "Idempotent Action Token",
        passwordHash: "not-used-by-integration-test",
        emailVerifiedAt: now,
      })
      .returning();
    if (!user) {
      throw new Error("Failed to create idempotent-token integration user");
    }

    const input = {
      userId: user.id,
      purpose: "password_reset" as const,
      tokenHash: createHash("sha256").update(`idempotent-${suffix}`).digest("hex"),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    };

    try {
      const first = await repository.replace(input);
      const retried = await repository.replace(input);
      const persisted = await database.db
        .select()
        .from(authActionTokens)
        .where(eq(authActionTokens.userId, user.id));

      expect(retried.id).toBe(first.id);
      expect(retried.consumedAt).toBeNull();
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.consumedAt).toBeNull();
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("distinguishes a repeated verification from an invalid token", async () => {
    const repository = new DrizzleAuthActionTokenRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const now = new Date();
    const [user] = await database.db
      .insert(users)
      .values({
        email: `repeated-verification-${suffix}@example.com`,
        name: "Repeated Verification",
        passwordHash: "not-used-by-integration-test",
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create integration user");
    }

    const tokenHash = createHash("sha256").update(`verify-${suffix}`).digest("hex");
    await repository.replace({
      userId: user.id,
      purpose: "email_verification",
      tokenHash,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });

    try {
      await expect(repository.consumeEmailVerification(tokenHash, now)).resolves.toMatchObject({
        outcome: "verified",
        user: { id: user.id },
      });
      await expect(repository.consumeEmailVerification(tokenHash, now)).resolves.toEqual({
        outcome: "already_verified",
      });
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("atomically consumes a reset token, updates credentials, and revokes sessions", async () => {
    const repository = new DrizzleAuthActionTokenRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const email = `atomic-password-reset-${suffix}@example.com`;
    const oldPasswordHash = "old-password-hash";
    const newPasswordHash = "new-password-hash";
    const now = new Date();
    const [user] = await database.db
      .insert(users)
      .values({
        email,
        name: "Atomic Password Reset",
        passwordHash: oldPasswordHash,
        emailVerifiedAt: now,
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create password-reset integration user");
    }

    const tokenHash = createHash("sha256").update(`reset-${suffix}`).digest("hex");
    const sessionId = crypto.randomUUID();
    const token = await repository.replace({
      userId: user.id,
      purpose: "password_reset",
      tokenHash,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    await database.db.insert(refreshSessions).values({
      id: sessionId,
      userId: user.id,
      familyId: crypto.randomUUID(),
      tokenHash: createHash("sha256").update(`session-${suffix}`).digest("hex"),
      authVersion: user.authVersion,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });

    try {
      await expect(
        repository.commitPasswordReset({
          tokenHash,
          passwordHash: newPasswordHash,
          changedAt: now,
        }),
      ).resolves.toMatchObject({
        outcome: "reset",
        user: { id: user.id, authVersion: user.authVersion + 1 },
      });

      const [persistedToken] = await database.db
        .select()
        .from(authActionTokens)
        .where(eq(authActionTokens.id, token.id))
        .limit(1);
      const [persistedUser] = await database.db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const [persistedSession] = await database.db
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.id, sessionId))
        .limit(1);

      expect(persistedToken?.consumedAt?.getTime()).toBe(now.getTime());
      expect(persistedUser).toMatchObject({
        passwordHash: newPasswordHash,
        authVersion: user.authVersion + 1,
      });
      expect(persistedSession).toMatchObject({
        revocationReason: "credentials_changed",
      });
      expect(persistedSession?.revokedAt?.getTime()).toBe(now.getTime());
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("rolls back token consumption when a later reset mutation fails", async () => {
    const repository = new DrizzleAuthActionTokenRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const email = `rollback-password-reset-${suffix}@example.com`;
    const oldPasswordHash = "old-password-hash";
    const now = new Date();
    const [user] = await database.db
      .insert(users)
      .values({
        email,
        name: "Rollback Password Reset",
        passwordHash: oldPasswordHash,
        emailVerifiedAt: now,
      })
      .returning();

    if (!user) {
      throw new Error("Failed to create rollback integration user");
    }

    const tokenHash = createHash("sha256").update(`rollback-${suffix}`).digest("hex");
    const sessionId = crypto.randomUUID();
    const token = await repository.replace({
      userId: user.id,
      purpose: "password_reset",
      tokenHash,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    await database.db.insert(refreshSessions).values({
      id: sessionId,
      userId: user.id,
      familyId: crypto.randomUUID(),
      tokenHash: createHash("sha256").update(`rollback-session-${suffix}`).digest("hex"),
      authVersion: user.authVersion,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });

    try {
      await expect(
        repository.commitPasswordReset({
          tokenHash,
          passwordHash: "x".repeat(256),
          changedAt: now,
        }),
      ).rejects.toThrow();

      const [persistedToken] = await database.db
        .select()
        .from(authActionTokens)
        .where(eq(authActionTokens.id, token.id))
        .limit(1);
      const [persistedUser] = await database.db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const [persistedSession] = await database.db
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.id, sessionId))
        .limit(1);

      expect(persistedToken?.consumedAt).toBeNull();
      expect(persistedUser).toMatchObject({
        passwordHash: oldPasswordHash,
        authVersion: user.authVersion,
      });
      expect(persistedSession).toMatchObject({
        revokedAt: null,
        revocationReason: null,
      });
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("marks every session in a compromised refresh family as reuse-detected", async () => {
    const repository = new DrizzleRefreshSessionRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const now = new Date();
    const familyId = crypto.randomUUID();
    const [user] = await database.db
      .insert(users)
      .values({
        email: `reuse-family-${suffix}@example.com`,
        name: "Reuse Family",
        passwordHash: "not-used-by-integration-test",
        emailVerifiedAt: now,
      })
      .returning();
    if (!user) {
      throw new Error("Failed to create reuse-family integration user");
    }

    const rotatedSessionId = crypto.randomUUID();
    const activeSessionId = crypto.randomUUID();
    await database.db.insert(refreshSessions).values([
      {
        id: rotatedSessionId,
        userId: user.id,
        familyId,
        tokenHash: createHash("sha256").update(`rotated-${suffix}`).digest("hex"),
        authVersion: user.authVersion,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: new Date(now.getTime() - 1_000),
        revocationReason: "rotated",
        createdAt: new Date(now.getTime() - 10_000),
      },
      {
        id: activeSessionId,
        userId: user.id,
        familyId,
        tokenHash: createHash("sha256").update(`active-${suffix}`).digest("hex"),
        authVersion: user.authVersion,
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: new Date(now.getTime() - 1_000),
      },
    ]);

    try {
      await expect(repository.revokeFamily(familyId, "reuse_detected", now)).resolves.toBe(2);
      const persisted = await database.db
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.familyId, familyId));

      expect(persisted).toHaveLength(2);
      expect(persisted.every(({ revocationReason }) => revocationReason === "reuse_detected")).toBe(
        true,
      );
      expect(persisted.every(({ revokedAt }) => revokedAt?.getTime() === now.getTime())).toBe(true);
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("revokes the active replacement when logout presents a rotated token", async () => {
    const repository = new DrizzleRefreshSessionRepository(database.db, metrics);
    const suffix = crypto.randomUUID();
    const now = new Date();
    const familyId = crypto.randomUUID();
    const rotatedTokenHash = createHash("sha256").update(`logout-rotated-${suffix}`).digest("hex");
    const activeTokenHash = createHash("sha256").update(`logout-active-${suffix}`).digest("hex");
    const [user] = await database.db
      .insert(users)
      .values({
        email: `logout-race-${suffix}@example.com`,
        name: "Logout Race",
        passwordHash: "not-used-by-integration-test",
        emailVerifiedAt: now,
      })
      .returning();
    if (!user) {
      throw new Error("Failed to create logout-race integration user");
    }

    await database.db.insert(refreshSessions).values([
      {
        id: crypto.randomUUID(),
        userId: user.id,
        familyId,
        tokenHash: rotatedTokenHash,
        authVersion: user.authVersion,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: new Date(now.getTime() - 1_000),
        revocationReason: "rotated",
        createdAt: new Date(now.getTime() - 10_000),
      },
      {
        id: crypto.randomUUID(),
        userId: user.id,
        familyId,
        tokenHash: activeTokenHash,
        authVersion: user.authVersion,
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: new Date(now.getTime() - 1_000),
      },
    ]);

    try {
      await expect(repository.revokeByTokenHash(rotatedTokenHash, "logout", now)).resolves.toBe(
        true,
      );
      const persisted = await database.db
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.familyId, familyId));
      const rotated = persisted.find(({ tokenHash }) => tokenHash === rotatedTokenHash);
      const replacement = persisted.find(({ tokenHash }) => tokenHash === activeTokenHash);

      expect(rotated).toMatchObject({ revocationReason: "rotated" });
      expect(replacement).toMatchObject({ revocationReason: "logout" });
      expect(replacement?.revokedAt?.getTime()).toBe(now.getTime());
    } finally {
      await database.db.delete(users).where(eq(users.id, user.id));
    }
  });

  it("durably deduplicates recipient work for the cooldown window", async () => {
    const repository = new DrizzleAuthEmailRequestRepository(database.db, metrics);
    const email = `queued-${crypto.randomUUID()}@example.com`;
    const now = new Date();
    const cooldownMs = 20 * 60_000;

    try {
      await repository.enqueue({
        email,
        purpose: "password_reset",
        requestedAt: now,
        cooldownBefore: new Date(now.getTime() - cooldownMs),
      });
      const [first] = await repository.claim({
        at: now,
        staleBefore: new Date(now.getTime() - 60_000),
        limit: 10,
      });

      expect(first).toMatchObject({ email, purpose: "password_reset", attempts: 1 });
      if (!first) {
        throw new Error("Failed to claim integration email request");
      }
      await repository.complete(first.id, first.claimId, now);

      await repository.enqueue({
        email,
        purpose: "password_reset",
        requestedAt: new Date(now.getTime() + 1_000),
        cooldownBefore: new Date(now.getTime() - cooldownMs + 1_000),
      });
      await expect(
        repository.claim({
          at: new Date(now.getTime() + 1_000),
          staleBefore: now,
          limit: 10,
        }),
      ).resolves.toEqual([]);

      const afterCooldown = new Date(now.getTime() + cooldownMs + 1);
      await repository.enqueue({
        email,
        purpose: "password_reset",
        requestedAt: afterCooldown,
        cooldownBefore: new Date(afterCooldown.getTime() - cooldownMs),
      });
      const [second] = await repository.claim({
        at: afterCooldown,
        staleBefore: now,
        limit: 10,
      });

      expect(second?.id).not.toBe(first.id);
      expect(second).toMatchObject({ email, attempts: 1 });
    } finally {
      await database.db
        .delete(authEmailRequests)
        .where(
          and(eq(authEmailRequests.email, email), eq(authEmailRequests.purpose, "password_reset")),
        );
    }
  });

  it("prevents a stale email worker from completing or retrying a reclaimed lease", async () => {
    const repository = new DrizzleAuthEmailRequestRepository(database.db, metrics);
    const email = `lease-ownership-${crypto.randomUUID()}@example.com`;
    const firstClaimAt = new Date();

    try {
      await repository.enqueue({
        email,
        purpose: "password_reset",
        requestedAt: firstClaimAt,
        cooldownBefore: new Date(firstClaimAt.getTime() - 60_000),
      });
      const [firstClaim] = await repository.claim({
        at: firstClaimAt,
        staleBefore: new Date(firstClaimAt.getTime() - 60_000),
        limit: 1,
      });
      if (!firstClaim) {
        throw new Error("Failed to create the first email-request lease");
      }
      const actionToken = {
        value: "pr_test-token",
        hash: createHash("sha256").update(`email-action-${email}`).digest("hex"),
        createdAt: firstClaimAt,
        expiresAt: new Date(firstClaimAt.getTime() + 60 * 60_000),
      };
      await expect(
        repository.storeActionToken({
          id: firstClaim.id,
          claimId: firstClaim.claimId,
          preparedAt: firstClaimAt,
          ...actionToken,
        }),
      ).resolves.toBe(true);

      const reclaimedAt = new Date(firstClaimAt.getTime() + 2 * 60_000);
      const [secondClaim] = await repository.claim({
        at: reclaimedAt,
        staleBefore: new Date(firstClaimAt.getTime() + 60_000),
        limit: 1,
      });
      if (!secondClaim) {
        throw new Error("Failed to reclaim the stale email-request lease");
      }

      expect(secondClaim).toMatchObject({
        id: firstClaim.id,
        attempts: 2,
        actionToken,
      });
      expect(secondClaim.claimId).not.toBe(firstClaim.claimId);
      await expect(
        repository.complete(firstClaim.id, firstClaim.claimId, reclaimedAt),
      ).resolves.toBe(false);
      await expect(
        repository.retry(
          firstClaim.id,
          firstClaim.claimId,
          new Date(reclaimedAt.getTime() + 30_000),
        ),
      ).resolves.toBe(false);
      await expect(
        repository.complete(secondClaim.id, secondClaim.claimId, reclaimedAt),
      ).resolves.toBe(true);

      const [persisted] = await database.db
        .select()
        .from(authEmailRequests)
        .where(eq(authEmailRequests.id, firstClaim.id))
        .limit(1);
      expect(persisted).toMatchObject({
        actionToken: null,
        actionTokenHash: null,
        actionTokenCreatedAt: null,
        actionTokenExpiresAt: null,
        claimId: null,
        lockedAt: null,
      });
      expect(persisted?.completedAt?.getTime()).toBe(reclaimedAt.getTime());
    } finally {
      await database.db
        .delete(authEmailRequests)
        .where(
          and(eq(authEmailRequests.email, email), eq(authEmailRequests.purpose, "password_reset")),
        );
    }
  });

  it("replaces an earlier resend request when registration must guarantee delivery", async () => {
    const repository = new DrizzleAuthEmailRequestRepository(database.db, metrics);
    const email = `registration-queue-${crypto.randomUUID()}@example.com`;
    const now = new Date();

    try {
      await repository.enqueue({
        email,
        purpose: "email_verification",
        requestedAt: now,
        cooldownBefore: new Date(now.getTime() - 20 * 60_000),
      });
      const [first] = await repository.claim({
        at: now,
        staleBefore: new Date(now.getTime() - 60_000),
        limit: 10,
      });

      expect(first).toMatchObject({ email, purpose: "email_verification" });
      if (!first) {
        throw new Error("Failed to claim initial verification request");
      }
      await repository.complete(first.id, first.claimId, now);

      const registrationTime = new Date(now.getTime() + 1_000);
      await repository.enqueue({
        email,
        purpose: "email_verification",
        requestedAt: registrationTime,
        cooldownBefore: registrationTime,
        replaceExisting: true,
      });
      const [replacement] = await repository.claim({
        at: registrationTime,
        staleBefore: now,
        limit: 10,
      });

      expect(replacement?.id).not.toBe(first.id);
      expect(replacement).toMatchObject({
        email,
        purpose: "email_verification",
        attempts: 1,
      });
    } finally {
      await database.db
        .delete(authEmailRequests)
        .where(
          and(
            eq(authEmailRequests.email, email),
            eq(authEmailRequests.purpose, "email_verification"),
          ),
        );
    }
  });
});
