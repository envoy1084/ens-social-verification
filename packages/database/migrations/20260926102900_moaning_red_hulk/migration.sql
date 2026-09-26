CREATE TABLE "github_attempts" (
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
	CONSTRAINT "github_attempts_status_check" CHECK ("status" in ('pending', 'processing', 'ready', 'publishing')),
	CONSTRAINT "github_attempts_ready_check" CHECK ("status" != 'ready' or ("identity" is not null and "claim" is not null and "encrypted_token" is not null))
);
--> statement-breakpoint
CREATE TABLE "github_publications" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"login" text NOT NULL,
	"gist_id" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "github_attempts_expiry_idx" ON "github_attempts" ("expires_at");--> statement-breakpoint
ALTER TABLE "github_publications" ADD CONSTRAINT "github_publications_id_github_attempts_id_fkey" FOREIGN KEY ("id") REFERENCES "github_attempts"("id") ON DELETE RESTRICT;