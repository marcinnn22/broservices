CREATE TYPE "public"."auth_email_request_purpose" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TABLE "auth_email_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"purpose" "auth_email_request_purpose" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_email_requests_email_normalized_check" CHECK ("auth_email_requests"."email" = lower(btrim("auth_email_requests"."email"))),
	CONSTRAINT "auth_email_requests_attempts_nonnegative_check" CHECK ("auth_email_requests"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_email_requests_recipient_purpose_unique_idx" ON "auth_email_requests" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "auth_email_requests_pending_idx" ON "auth_email_requests" USING btree ("available_at","created_at") WHERE "auth_email_requests"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "auth_email_requests_completed_at_idx" ON "auth_email_requests" USING btree ("completed_at");