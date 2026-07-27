import { sql } from "drizzle-orm";
import {
  char,
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
import { users } from "../../../users/infrastructure/postgres/users.schema.js";

export const authActionPurposeEnum = pgEnum("auth_action_purpose", [
  "email_verification",
  "password_reset",
]);

export const authEmailRequestPurposeEnum = pgEnum("auth_email_request_purpose", [
  "email_verification",
  "password_reset",
]);

export const refreshSessionRevocationReasonEnum = pgEnum("refresh_session_revocation_reason", [
  "rotated",
  "logout",
  "logout_all",
  "credentials_changed",
  "account_changed",
  "reuse_detected",
]);

export const authActionTokens = pgTable(
  "auth_action_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authActionPurposeEnum("purpose").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_action_tokens_hash_unique_idx").on(table.tokenHash),
    uniqueIndex("auth_action_tokens_one_active_per_user_purpose_idx")
      .on(table.userId, table.purpose)
      .where(sql`${table.consumedAt} IS NULL`),
    index("auth_action_tokens_user_purpose_idx").on(table.userId, table.purpose),
    index("auth_action_tokens_expires_at_idx").on(table.expiresAt),
    check("auth_action_tokens_hash_format_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("auth_action_tokens_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const authEmailRequests = pgTable(
  "auth_email_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    purpose: authEmailRequestPurposeEnum("purpose").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    actionToken: varchar("action_token", { length: 128 }),
    actionTokenHash: char("action_token_hash", { length: 64 }),
    actionTokenCreatedAt: timestamp("action_token_created_at", {
      withTimezone: true,
      mode: "date",
    }),
    actionTokenExpiresAt: timestamp("action_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", {
      withTimezone: true,
      mode: "date",
    }),
    claimId: uuid("claim_id"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_email_requests_recipient_purpose_unique_idx").on(table.email, table.purpose),
    index("auth_email_requests_pending_idx")
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.completedAt} IS NULL`),
    index("auth_email_requests_completed_at_idx").on(table.completedAt),
    check(
      "auth_email_requests_email_normalized_check",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check("auth_email_requests_attempts_nonnegative_check", sql`${table.attempts} >= 0`),
    check(
      "auth_email_requests_action_token_consistency_check",
      sql`(${table.actionToken} IS NULL AND ${table.actionTokenHash} IS NULL AND ${table.actionTokenCreatedAt} IS NULL AND ${table.actionTokenExpiresAt} IS NULL) OR (${table.actionToken} IS NOT NULL AND ${table.actionTokenHash} IS NOT NULL AND ${table.actionTokenCreatedAt} IS NOT NULL AND ${table.actionTokenExpiresAt} IS NOT NULL AND ${table.actionTokenExpiresAt} > ${table.actionTokenCreatedAt})`,
    ),
    check(
      "auth_email_requests_action_token_hash_format_check",
      sql`${table.actionTokenHash} IS NULL OR ${table.actionTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_email_requests_claim_consistency_check",
      sql`(${table.lockedAt} IS NULL AND ${table.claimId} IS NULL) OR (${table.lockedAt} IS NOT NULL AND ${table.claimId} IS NOT NULL)`,
    ),
  ],
);

export const refreshSessions = pgTable(
  "refresh_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    authVersion: integer("auth_version").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    revocationReason: refreshSessionRevocationReasonEnum("revocation_reason"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("refresh_sessions_hash_unique_idx").on(table.tokenHash),
    index("refresh_sessions_user_id_idx").on(table.userId),
    index("refresh_sessions_family_id_idx").on(table.familyId),
    index("refresh_sessions_expires_at_idx").on(table.expiresAt),
    check("refresh_sessions_hash_format_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("refresh_sessions_auth_version_nonnegative_check", sql`${table.authVersion} >= 0`),
    check("refresh_sessions_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "refresh_sessions_revocation_consistency_check",
      sql`(${table.revokedAt} IS NULL AND ${table.revocationReason} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revocationReason} IS NOT NULL)`,
    ),
  ],
);
