import { and, count, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Database } from "../../../../platform/database/database.js";
import { hasPostgresErrorCode } from "../../../../platform/database/postgres-error.js";
import {
  type DatabaseOperation,
  type DatabaseQueryObserver,
  observeDatabaseQuery,
} from "../../../../platform/database/query-observer.js";
import type {
  CreateUserRecord,
  ListUsersQuery,
  UserPage,
  UserRepository,
} from "../../application/ports/user-repository.js";
import {
  DuplicateUserEmailError,
  LastAdminProtectionError,
  UserOperationForbiddenError,
} from "../../domain/user.errors.js";
import type { User, UserRole, UserStatus, UserWithCredentials } from "../../domain/user.js";
import { users } from "./users.schema.js";

type UserRow = typeof users.$inferSelect;

export class DrizzleUserRepository implements UserRepository {
  constructor(
    private readonly db: Database,
    private readonly queryObserver: DatabaseQueryObserver,
  ) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.query("select", () =>
      this.db.select().from(users).where(eq(users.id, id)).limit(1),
    );

    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.query("select", () =>
      this.db.select().from(users).where(eq(users.email, email)).limit(1),
    );

    return row ? toDomain(row) : null;
  }

  async findCredentialsByEmail(email: string): Promise<UserWithCredentials | null> {
    const [row] = await this.query("select", () =>
      this.db.select().from(users).where(eq(users.email, email)).limit(1),
    );

    if (!row) {
      return null;
    }

    return {
      user: toDomain(row),
      passwordHash: row.passwordHash,
    };
  }

  async create(input: CreateUserRecord): Promise<User> {
    try {
      const [row] = await this.query("insert", () =>
        this.db
          .insert(users)
          .values({
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash,
            role: input.role ?? "user",
          })
          .returning(),
      );

      return toDomain(requireRow(row, "create user"));
    } catch (error) {
      if (hasPostgresErrorCode(error, "23505")) {
        throw new DuplicateUserEmailError({ cause: error });
      }

      throw error;
    }
  }

  async deleteUnverified(id: string): Promise<boolean> {
    const rows = await this.query("delete", () =>
      this.db
        .delete(users)
        .where(and(eq(users.id, id), isNull(users.emailVerifiedAt)))
        .returning({ id: users.id }),
    );

    return rows.length > 0;
  }

  async list(query: ListUsersQuery): Promise<UserPage> {
    const conditions: SQL[] = [];

    if (query.search) {
      const searchCondition = or(
        ilike(users.email, `%${escapeLikePattern(query.search)}%`),
        ilike(users.name, `%${escapeLikePattern(query.search)}%`),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }

    if (query.status) {
      conditions.push(eq(users.status, query.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [rows, totalRows] = await Promise.all([
      this.query("select", () =>
        this.db
          .select()
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt), desc(users.id))
          .limit(query.pageSize)
          .offset(offset),
      ),
      this.query("select", () => this.db.select({ value: count() }).from(users).where(where)),
    ]);

    return {
      items: rows.map(toDomain),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  async updateName(id: string, name: string, updatedAt: Date): Promise<User | null> {
    const [row] = await this.query("update", () =>
      this.db.update(users).set({ name, updatedAt }).where(eq(users.id, id)).returning(),
    );

    return row ? toDomain(row) : null;
  }

  async changeRole(
    actorId: string,
    id: string,
    role: UserRole,
    updatedAt: Date,
  ): Promise<User | null> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(846201117)`);

        const [actor] = await transaction
          .select()
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1);
        if (actor?.role !== "admin" || actor.status !== "active") {
          throw new UserOperationForbiddenError(
            "The acting user is no longer an active administrator",
          );
        }

        const [target] = await transaction.select().from(users).where(eq(users.id, id)).limit(1);
        if (!target) {
          return null;
        }
        if (target.role === role) {
          return toDomain(target);
        }

        if (target.role === "admin" && target.status === "active" && role !== "admin") {
          const [activeAdmins] = await transaction
            .select({ value: count() })
            .from(users)
            .where(and(eq(users.role, "admin"), eq(users.status, "active")));

          if (Number(activeAdmins?.value ?? 0) <= 1) {
            throw new LastAdminProtectionError();
          }
        }

        const [row] = await transaction
          .update(users)
          .set({
            role,
            authVersion: sql`${users.authVersion} + 1`,
            updatedAt,
          })
          .where(eq(users.id, id))
          .returning();

        return row ? toDomain(row) : null;
      }),
    );
  }

  async changeStatus(
    actorId: string,
    id: string,
    status: UserStatus,
    updatedAt: Date,
  ): Promise<User | null> {
    return this.query("transaction", () =>
      this.db.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(846201117)`);

        const [actor] = await transaction
          .select()
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1);
        if (actor?.role !== "admin" || actor.status !== "active") {
          throw new UserOperationForbiddenError(
            "The acting user is no longer an active administrator",
          );
        }

        const [target] = await transaction.select().from(users).where(eq(users.id, id)).limit(1);
        if (!target) {
          return null;
        }
        if (target.status === status) {
          return toDomain(target);
        }

        if (target.role === "admin" && target.status === "active" && status === "disabled") {
          const [activeAdmins] = await transaction
            .select({ value: count() })
            .from(users)
            .where(and(eq(users.role, "admin"), eq(users.status, "active")));

          if (Number(activeAdmins?.value ?? 0) <= 1) {
            throw new LastAdminProtectionError();
          }
        }

        const [row] = await transaction
          .update(users)
          .set({
            status,
            disabledAt: status === "disabled" ? updatedAt : null,
            authVersion: sql`${users.authVersion} + 1`,
            updatedAt,
          })
          .where(eq(users.id, id))
          .returning();

        return row ? toDomain(row) : null;
      }),
    );
  }

  async bumpAuthVersion(id: string, updatedAt: Date): Promise<User | null> {
    const [row] = await this.query("update", () =>
      this.db
        .update(users)
        .set({
          authVersion: sql`${users.authVersion} + 1`,
          updatedAt,
        })
        .where(eq(users.id, id))
        .returning(),
    );

    return row ? toDomain(row) : null;
  }

  private query<T>(operation: DatabaseOperation, query: () => PromiseLike<T>): Promise<T> {
    return observeDatabaseQuery(this.queryObserver, { operation, table: "users" }, query);
  }
}

function toDomain(row: UserRow): User {
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

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
