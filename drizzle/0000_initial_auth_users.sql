CREATE TYPE "public"."auth_action_purpose" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."refresh_session_revocation_reason" AS ENUM('rotated', 'logout', 'logout_all', 'credentials_changed', 'account_changed', 'reuse_detected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "auth_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "auth_action_purpose" NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_action_tokens_hash_format_check" CHECK ("auth_action_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_action_tokens_expiry_check" CHECK ("auth_action_tokens"."expires_at" > "auth_action_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"auth_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" "refresh_session_revocation_reason",
	"ip_address" varchar(45),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_sessions_hash_format_check" CHECK ("refresh_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "refresh_sessions_auth_version_nonnegative_check" CHECK ("refresh_sessions"."auth_version" >= 0),
	CONSTRAINT "refresh_sessions_expiry_check" CHECK ("refresh_sessions"."expires_at" > "refresh_sessions"."created_at"),
	CONSTRAINT "refresh_sessions_revocation_consistency_check" CHECK (("refresh_sessions"."revoked_at" IS NULL AND "refresh_sessions"."revocation_reason" IS NULL) OR ("refresh_sessions"."revoked_at" IS NOT NULL AND "refresh_sessions"."revocation_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"auth_version" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email" = lower(btrim("users"."email"))),
	CONSTRAINT "users_name_not_blank_check" CHECK (length(btrim("users"."name")) >= 2),
	CONSTRAINT "users_auth_version_nonnegative_check" CHECK ("users"."auth_version" >= 0),
	CONSTRAINT "users_disabled_at_consistency_check" CHECK (("users"."status" = 'disabled' AND "users"."disabled_at" IS NOT NULL) OR ("users"."status" = 'active' AND "users"."disabled_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_action_tokens_hash_unique_idx" ON "auth_action_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_action_tokens_one_active_per_user_purpose_idx" ON "auth_action_tokens" USING btree ("user_id","purpose") WHERE "auth_action_tokens"."consumed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "auth_action_tokens_user_purpose_idx" ON "auth_action_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_action_tokens_expires_at_idx" ON "auth_action_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_sessions_hash_unique_idx" ON "refresh_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_created_at_id_idx" ON "users" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");