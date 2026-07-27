import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Database } from "../../../../platform/database/database.js";
import {
  type DatabaseOperation,
  type DatabaseQueryObserver,
  observeDatabaseQuery,
} from "../../../../platform/database/query-observer.js";
import type {
  CreateRefreshSessionInput,
  RefreshSessionRepository,
  RotateRefreshSessionInput,
} from "../../application/ports/refresh-session-repository.js";
import type {
  RefreshSession,
  RefreshSessionRevocationReason,
} from "../../domain/refresh-session.js";
import { refreshSessions } from "./auth.schema.js";

type RefreshSessionRow = typeof refreshSessions.$inferSelect;

export class DrizzleRefreshSessionRepository implements RefreshSessionRepository {
  constructor(
    private readonly db: Database,
    private readonly queryObserver: DatabaseQueryObserver,
  ) {}

  async findById(id: string): Promise<RefreshSession | null> {
    const [row] = await this.query("select", () =>
      this.db.select().from(refreshSessions).where(eq(refreshSessions.id, id)).limit(1),
    );

    return row ? toDomain(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const [row] = await this.query("select", () =>
      this.db
        .select()
        .from(refreshSessions)
        .where(eq(refreshSessions.tokenHash, tokenHash))
        .limit(1),
    );

    return row ? toDomain(row) : null;
  }

  async create(input: CreateRefreshSessionInput): Promise<RefreshSession> {
    const [row] = await this.query("insert", () =>
      this.db.insert(refreshSessions).values(input).returning(),
    );

    return toDomain(requireRow(row, "create refresh session"));
  }

  async rotate(input: RotateRefreshSessionInput): Promise<RefreshSession | null> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        const [current] = await transaction
          .update(refreshSessions)
          .set({
            revokedAt: input.rotatedAt,
            revocationReason: "rotated",
            lastUsedAt: input.rotatedAt,
          })
          .where(
            and(
              eq(refreshSessions.id, input.currentSessionId),
              isNull(refreshSessions.revokedAt),
              gt(refreshSessions.expiresAt, input.rotatedAt),
            ),
          )
          .returning({
            userId: refreshSessions.userId,
            familyId: refreshSessions.familyId,
          });

        if (!current) {
          return null;
        }

        const [replacement] = await transaction
          .insert(refreshSessions)
          .values({
            id: input.replacementSessionId,
            userId: current.userId,
            familyId: current.familyId,
            tokenHash: input.tokenHash,
            authVersion: input.authVersion,
            expiresAt: input.expiresAt,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            createdAt: input.rotatedAt,
          })
          .returning();

        return toDomain(requireRow(replacement, "create rotated refresh session"));
      }),
    );
  }

  async revokeByTokenHash(
    tokenHash: string,
    reason: RefreshSessionRevocationReason,
    revokedAt: Date,
  ): Promise<boolean> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        // Locking the presented row serializes this operation with rotation. If
        // rotation wins, the next statement sees and revokes its replacement.
        // If logout wins, rotation can no longer consume the presented row.
        const [presented] = await transaction
          .select({ familyId: refreshSessions.familyId })
          .from(refreshSessions)
          .where(eq(refreshSessions.tokenHash, tokenHash))
          .for("update")
          .limit(1);

        if (!presented) {
          return false;
        }

        const rows = await transaction
          .update(refreshSessions)
          .set({ revokedAt, revocationReason: reason })
          .where(
            and(
              eq(refreshSessions.familyId, presented.familyId),
              isNull(refreshSessions.revokedAt),
            ),
          )
          .returning({ id: refreshSessions.id });

        return rows.length > 0;
      }),
    );
  }

  async revokeFamily(
    familyId: string,
    reason: RefreshSessionRevocationReason,
    revokedAt: Date,
  ): Promise<number> {
    const where =
      reason === "reuse_detected"
        ? eq(refreshSessions.familyId, familyId)
        : and(eq(refreshSessions.familyId, familyId), isNull(refreshSessions.revokedAt));
    const rows = await this.query("update", () =>
      this.db
        .update(refreshSessions)
        .set({ revokedAt, revocationReason: reason })
        .where(where)
        .returning({ id: refreshSessions.id }),
    );

    return rows.length;
  }

  async revokeAllForUser(
    userId: string,
    reason: RefreshSessionRevocationReason,
    revokedAt: Date,
  ): Promise<number> {
    const rows = await this.query("update", () =>
      this.db
        .update(refreshSessions)
        .set({ revokedAt, revocationReason: reason })
        .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)))
        .returning({ id: refreshSessions.id }),
    );

    return rows.length;
  }

  async deleteExpired(before: Date): Promise<number> {
    const rows = await this.query("delete", () =>
      this.db
        .delete(refreshSessions)
        .where(lt(refreshSessions.expiresAt, before))
        .returning({ id: refreshSessions.id }),
    );

    return rows.length;
  }

  private query<T>(operation: DatabaseOperation, query: () => PromiseLike<T>): Promise<T> {
    return observeDatabaseQuery(
      this.queryObserver,
      { operation, table: "refresh_sessions" },
      query,
    );
  }
}

function toDomain(row: RefreshSessionRow): RefreshSession {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    tokenHash: row.tokenHash,
    authVersion: row.authVersion,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    revocationReason: row.revocationReason,
    createdAt: row.createdAt,
  };
}

function requireRow<T>(row: T | undefined, operation: string): T {
  if (!row) {
    throw new Error(`PostgreSQL did not return a row for operation: ${operation}`);
  }

  return row;
}
