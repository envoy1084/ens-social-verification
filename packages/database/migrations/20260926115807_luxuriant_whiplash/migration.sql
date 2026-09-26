CREATE TABLE "x_attempts" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"wallet_address" text NOT NULL,
	"session_hash" text NOT NULL,
	"state_hash" text NOT NULL UNIQUE,
	"pkce_challenge" text NOT NULL,
	"status" text NOT NULL,
	"encrypted_token" text,
	"identity" jsonb,
	"claim" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "x_attempts_status_check" CHECK ("status" in ('pending', 'processing', 'ready', 'publishing')),
	CONSTRAINT "x_attempts_ready_check" CHECK ("status" != 'ready' or ("identity" is not null and "claim" is not null and "encrypted_token" is not null))
);
--> statement-breakpoint
CREATE TABLE "x_publications" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"login" text NOT NULL,
	"post_id" text NOT NULL UNIQUE,
	"envelope" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "x_attempts_expiry_idx" ON "x_attempts" ("expires_at");--> statement-breakpoint
ALTER TABLE "x_publications" ADD CONSTRAINT "x_publications_id_x_attempts_id_fkey" FOREIGN KEY ("id") REFERENCES "x_attempts"("id") ON DELETE RESTRICT;