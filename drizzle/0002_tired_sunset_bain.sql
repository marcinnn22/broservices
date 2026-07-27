ALTER TABLE "auth_email_requests" ADD COLUMN "claim_id" uuid;--> statement-breakpoint
UPDATE "auth_email_requests" SET "locked_at" = NULL WHERE "locked_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_email_requests" ADD CONSTRAINT "auth_email_requests_claim_consistency_check" CHECK (("auth_email_requests"."locked_at" IS NULL AND "auth_email_requests"."claim_id" IS NULL) OR ("auth_email_requests"."locked_at" IS NOT NULL AND "auth_email_requests"."claim_id" IS NOT NULL));
