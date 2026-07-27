import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../../../../platform/database/database.js";
import {
  type DatabaseOperation,
  type DatabaseQueryObserver,
  observeDatabaseQuery,
} from "../../../../platform/database/query-observer.js";
import { users } from "../../../users/infrastructure/postgres/users.schema.js";
import type {
  AuthActionTokenRepository,
  CommitPasswordResetInput,
  EmailVerificationResult,
  PasswordResetCommitResult,
  ReplaceAuthActionTokenInput,
} from "../../application/ports/auth-action-token-repository.js";
import type { AuthActionPurpose, AuthActionToken } from "../../domain/auth-action-token.js";
import { authActionTokens, refreshSessions } from "./auth.schema.js";

type AuthActionTokenRow = typeof authActionTokens.$inferSelect;

export class DrizzleAuthActionTokenRepository implements AuthActionTokenRepository {
  constructor(
    private readonly db: Database,
    private readonly queryObserver: DatabaseQueryObserver,
  ) {}

  async replace(input: ReplaceAuthActionTokenInput): Promise<AuthActionToken> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        // Serializes issuance for this user, including when no prior action-token
        // row exists. The partial unique index remains a final integrity guard.
        await transaction.execute(
          sql`select 1 from ${users} where ${users.id} = ${input.userId} for update`,
        );

        const [existing] = await transaction
          .select()
          .from(authActionTokens)
          .where(eq(authActionTokens.tokenHash, input.tokenHash))
          .limit(1);

        if (existing) {
          const matchesInput =
            existing.userId === input.userId &&
            existing.purpose === input.purpose &&
            existing.createdAt.getTime() === input.createdAt.getTime() &&
            existing.expiresAt.getTime() === input.expiresAt.getTime();

          if (!matchesInput) {
            throw new Error("An action token hash collision was detected");
          }

          // Preparing a durable email is retryable. Returning the original row
          // preserves the link and never reactivates a token already consumed.
          return toDomain(existing);
        }

        await transaction
          .update(authActionTokens)
          .set({ consumedAt: input.createdAt })
          .where(
            and(
              eq(authActionTokens.userId, input.userId),
              eq(authActionTokens.purpose, input.purpose),
              isNull(authActionTokens.consumedAt),
            ),
          );

        const [row] = await transaction.insert(authActionTokens).values(input).returning();

        return toDomain(requireRow(row, "replace auth action token"));
      }),
    );
  }

  async findValid(
    tokenHash: string,
    purpose: AuthActionPurpose,
    at: Date,
  ): Promise<AuthActionToken | null> {
    const [row] = await this.query("select", () =>
      this.db
        .select()
        .from(authActionTokens)
        .where(
          and(
            eq(authActionTokens.tokenHash, tokenHash),
            eq(authActionTokens.purpose, purpose),
            isNull(authActionTokens.consumedAt),
            gt(authActionTokens.expiresAt, at),
          ),
        )
        .limit(1),
    );

    return row ? toDomain(row) : null;
  }

  async commitPasswordReset(input: CommitPasswordResetInput): Promise<PasswordResetCommitResult> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        const [candidate] = await transaction
          .select({
            id: authActionTokens.id,
            userId: authActionTokens.userId,
          })
          .from(authActionTokens)
          .where(
            and(
              eq(authActionTokens.tokenHash, input.tokenHash),
              eq(authActionTokens.purpose, "password_reset"),
              isNull(authActionTokens.consumedAt),
              gt(authActionTokens.expiresAt, input.changedAt),
            ),
          )
          .limit(1);

        if (!candidate) {
          return { outcome: "invalid" };
        }

        // User-first locking matches token replacement and prevents lock-order
        // inversion when issuance races with consumption.
        const [user] = await transaction
          .select()
          .from(users)
          .where(eq(users.id, candidate.userId))
          .for("update")
          .limit(1);

        if (!user) {
          return { outcome: "invalid" };
        }
        if (user.status !== "active") {
          return { outcome: "disabled" };
        }

        const [consumed] = await transaction
          .update(authActionTokens)
          .set({ consumedAt: input.changedAt })
          .where(
            and(
              eq(authActionTokens.id, candidate.id),
              isNull(authActionTokens.consumedAt),
              gt(authActionTokens.expiresAt, input.changedAt),
            ),
          )
          .returning({ id: authActionTokens.id });

        if (!consumed) {
          return { outcome: "invalid" };
        }

        const [updatedUser] = await transaction
          .update(users)
          .set({
            passwordHash: input.passwordHash,
            authVersion: sql`${users.authVersion} + 1`,
            updatedAt: input.changedAt,
          })
          .where(and(eq(users.id, user.id), eq(users.status, "active")))
          .returning();

        if (!updatedUser) {
          throw new Error("Password reset could not update the locked active user");
        }

        await transaction
          .update(refreshSessions)
          .set({
            revokedAt: input.changedAt,
            revocationReason: "credentials_changed",
          })
          .where(
            and(eq(refreshSessions.userId, updatedUser.id), isNull(refreshSessions.revokedAt)),
          );

        return { outcome: "reset", user: toUserDomain(updatedUser) };
      }),
    );
  }

  async consumeEmailVerification(
    tokenHash: string,
    verifiedAt: Date,
  ): Promise<EmailVerificationResult> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        const [candidate] = await transaction
          .select({
            id: authActionTokens.id,
            userId: authActionTokens.userId,
            consumedAt: authActionTokens.consumedAt,
            expiresAt: authActionTokens.expiresAt,
          })
          .from(authActionTokens)
          .where(
            and(
              eq(authActionTokens.tokenHash, tokenHash),
              eq(authActionTokens.purpose, "email_verification"),
            ),
          )
          .limit(1);

        if (!candidate || candidate.expiresAt.getTime() <= verifiedAt.getTime()) {
          return { outcome: "invalid" };
        }

        const [user] = await transaction
          .select()
          .from(users)
          .where(eq(users.id, candidate.userId))
          .for("update")
          .limit(1);

        if (!user) {
          return { outcome: "invalid" };
        }
        if (user.status !== "active") {
          return { outcome: "disabled" };
        }
        if (user.emailVerifiedAt !== null) {
          return { outcome: "already_verified" };
        }
        if (candidate.consumedAt !== null) {
          return { outcome: "invalid" };
        }

        const [consumed] = await transaction
          .update(authActionTokens)
          .set({ consumedAt: verifiedAt })
          .where(
            and(
              eq(authActionTokens.id, candidate.id),
              isNull(authActionTokens.consumedAt),
              gt(authActionTokens.expiresAt, verifiedAt),
            ),
          )
          .returning({ id: authActionTokens.id });

        if (!consumed) {
          return { outcome: "invalid" };
        }

        const [verifiedUser] = await transaction
          .update(users)
          .set({ emailVerifiedAt: verifiedAt, updatedAt: verifiedAt })
          .where(and(eq(users.id, user.id), eq(users.status, "active")))
          .returning();

        return verifiedUser
          ? { outcome: "verified", user: toUserDomain(verifiedUser) }
          : { outcome: "invalid" };
      }),
    );
  }

  async deleteExpired(before: Date): Promise<number> {
    const rows = await this.query("delete", () =>
      this.db
        .delete(authActionTokens)
        .where(lt(authActionTokens.expiresAt, before))
        .returning({ id: authActionTokens.id }),
    );

    return rows.length;
  }

  private query<T>(operation: DatabaseOperation, query: () => PromiseLike<T>): Promise<T> {
    return observeDatabaseQuery(
      this.queryObserver,
      { operation, table: "auth_action_tokens" },
      query,
    );
  }
}

function toDomain(row: AuthActionTokenRow): AuthActionToken {
  return {
    id: row.id,
    userId: row.userId,
    purpose: row.purpose,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}

function toUserDomain(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt,
    authVersion: row.authVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function requireRow<T>(row: T | undefined, operation: string): T {
  if (!row) {
    throw new Error(`PostgreSQL did not return a row for operation: ${operation}`);
  }

  return row;
}
