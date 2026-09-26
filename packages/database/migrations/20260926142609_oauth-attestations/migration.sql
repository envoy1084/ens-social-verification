CREATE TABLE "oauth_attempts" (
	"id" uuid PRIMARY KEY,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"wallet_address" text NOT NULL,
	"session_hash" text NOT NULL,
	"state_hash" text NOT NULL UNIQUE,
	"pkce_challenge" text NOT NULL,
	"status" text NOT NULL,
	"identity" jsonb,
	"claim" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_attempts_status_check" CHECK ("status" in ('pending', 'processing', 'ready')),
	CONSTRAINT "oauth_attempts_ready_check" CHECK ("status" != 'ready' or ("identity" is not null and "claim" is not null))
);
--> statement-breakpoint
CREATE TABLE "oauth_attestations" (
	"id" uuid PRIMARY KEY,
	"envelope" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "oauth_attempts_expiry_idx" ON "oauth_attempts" ("expires_at");