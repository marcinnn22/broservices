import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum("role").default("user").notNull(),
    status: userStatusEnum("status").default("active").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    authVersion: integer("auth_version").default(0).notNull(),
    disabledAt: timestamp("disabled_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique_idx").on(sql`lower(${table.email})`),
    index("users_created_at_id_idx").on(table.createdAt, table.id),
    index("users_status_idx").on(table.status),
    check("users_email_normalized_check", sql`${table.email} = lower(btrim(${table.email}))`),
    check("users_name_not_blank_check", sql`length(btrim(${table.name})) >= 2`),
    check("users_auth_version_nonnegative_check", sql`${table.authVersion} >= 0`),
    check(
      "users_disabled_at_consistency_check",
      sql`(${table.status} = 'disabled' AND ${table.disabledAt} IS NOT NULL) OR (${table.status} = 'active' AND ${table.disabledAt} IS NULL)`,
    ),
  ],
);
