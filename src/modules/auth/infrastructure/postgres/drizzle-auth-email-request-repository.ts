import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import type { Database } from "../../../../platform/database/database.js";
import {
  type DatabaseOperation,
  type DatabaseQueryObserver,
  observeDatabaseQuery,
} from "../../../../platform/database/query-observer.js";
import type {
  AuthEmailRequest,
  AuthEmailRequestRepository,
  ClaimAuthEmailRequestsInput,
  EnqueueAuthEmailRequestInput,
  StoreAuthEmailActionTokenInput,
} from "../../application/ports/auth-email-request-repository.js";
import { authEmailRequests } from "./auth.schema.js";

export class DrizzleAuthEmailRequestRepository implements AuthEmailRequestRepository {
  constructor(
    private readonly db: Database,
    private readonly queryObserver: DatabaseQueryObserver,
  ) {}

  async enqueue(input: EnqueueAuthEmailRequestInput): Promise<void> {
    await this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        const matchingRecipientAndPurpose = and(
          eq(authEmailRequests.email, input.email),
          eq(authEmailRequests.purpose, input.purpose),
        );

        await transaction
          .delete(authEmailRequests)
          .where(
            input.replaceExisting
              ? matchingRecipientAndPurpose
              : and(
                  matchingRecipientAndPurpose,
                  isNotNull(authEmailRequests.completedAt),
                  lte(authEmailRequests.completedAt, input.cooldownBefore),
                ),
          );

        await transaction
          .insert(authEmailRequests)
          .values({
            email: input.email,
            purpose: input.purpose,
            availableAt: input.requestedAt,
            createdAt: input.requestedAt,
          })
          .onConflictDoNothing();
      }),
    );
  }

  async claim(input: ClaimAuthEmailRequestsInput): Promise<readonly AuthEmailRequest[]> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        const candidates = await transaction
          .select({ id: authEmailRequests.id })
          .from(authEmailRequests)
          .where(
            and(
              isNull(authEmailRequests.completedAt),
              lte(authEmailRequests.availableAt, input.at),
              or(
                isNull(authEmailRequests.lockedAt),
                lt(authEmailRequests.lockedAt, input.staleBefore),
              ),
            ),
          )
          .orderBy(asc(authEmailRequests.createdAt), asc(authEmailRequests.id))
          .limit(input.limit)
          .for("update", { skipLocked: true });

        if (candidates.length === 0) {
          return [];
        }

        const rows = await transaction
          .update(authEmailRequests)
          .set({
            lockedAt: input.at,
            claimId: sql`gen_random_uuid()`,
            attempts: sql`${authEmailRequests.attempts} + 1`,
          })
          .where(
            inArray(
              authEmailRequests.id,
              candidates.map(({ id }) => id),
            ),
          )
          .returning();

        return rows.map(toDomain);
      }),
    );
  }

  async complete(id: string, claimId: string, completedAt: Date): Promise<boolean> {
    const rows = await this.query("update", () =>
      this.db
        .update(authEmailRequests)
        .set({
          actionToken: null,
          actionTokenHash: null,
          actionTokenCreatedAt: null,
          actionTokenExpiresAt: null,
          completedAt,
          lockedAt: null,
          claimId: null,
        })
        .where(and(eq(authEmailRequests.id, id), eq(authEmailRequests.claimId, claimId)))
        .returning({ id: authEmailRequests.id }),
    );

    return rows.length > 0;
  }

  async storeActionToken(input: StoreAuthEmailActionTokenInput): Promise<boolean> {
    const rows = await this.query("update", () =>
      this.db
        .update(authEmailRequests)
        .set({
          actionToken: input.value,
          actionTokenHash: input.hash,
          actionTokenCreatedAt: input.createdAt,
          actionTokenExpiresAt: input.expiresAt,
        })
        .where(
          and(
            eq(authEmailRequests.id, input.id),
            eq(authEmailRequests.claimId, input.claimId),
            or(
              isNull(authEmailRequests.actionToken),
              lte(authEmailRequests.actionTokenExpiresAt, input.preparedAt),
            ),
          ),
        )
        .returning({ id: authEmailRequests.id }),
    );

    return rows.length > 0;
  }

  async retry(id: string, claimId: string, availableAt: Date): Promise<boolean> {
    const rows = await this.query("update", () =>
      this.db
        .update(authEmailRequests)
        .set({ availableAt, lockedAt: null, claimId: null })
        .where(and(eq(authEmailRequests.id, id), eq(authEmailRequests.claimId, claimId)))
        .returning({ id: authEmailRequests.id }),
    );

    return rows.length > 0;
  }

  async deleteCompleted(before: Date): Promise<number> {
    const rows = await this.query("delete", () =>
      this.db
        .delete(authEmailRequests)
        .where(
          and(isNotNull(authEmailRequests.completedAt), lt(authEmailRequests.completedAt, before)),
        )
        .returning({ id: authEmailRequests.id }),
    );

    return rows.length;
  }

  private query<T>(operation: DatabaseOperation, query: () => PromiseLike<T>): Promise<T> {
    return observeDatabaseQuery(
      this.queryObserver,
      { operation, table: "auth_email_requests" },
      query,
    );
  }
}

function toDomain(row: typeof authEmailRequests.$inferSelect): AuthEmailRequest {
  if (row.claimId === null) {
    throw new Error(`Claimed auth email request ${row.id} has no claim ID`);
  }

  const actionTokenValues = [
    row.actionToken,
    row.actionTokenHash,
    row.actionTokenCreatedAt,
    row.actionTokenExpiresAt,
  ];
  const hasActionToken = actionTokenValues.every((value) => value !== null);
  if (!hasActionToken && actionTokenValues.some((value) => value !== null)) {
    throw new Error(`Auth email request ${row.id} has an incomplete action token`);
  }

  return {
    id: row.id,
    email: row.email,
    purpose: row.purpose,
    attempts: row.attempts,
    claimId: row.claimId,
    actionToken: hasActionToken
      ? {
          value: requireValue(row.actionToken),
          hash: requireValue(row.actionTokenHash),
          createdAt: requireValue(row.actionTokenCreatedAt),
          expiresAt: requireValue(row.actionTokenExpiresAt),
        }
      : null,
    createdAt: row.createdAt,
  };
}

function requireValue<T>(value: T | null): T {
  if (value === null) {
    throw new Error("Expected a complete auth email action token");
  }

  return value;
}
