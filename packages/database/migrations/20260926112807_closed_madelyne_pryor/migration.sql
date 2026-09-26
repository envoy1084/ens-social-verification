CREATE TABLE "farcaster_attempts" (
	"id" uuid PRIMARY KEY,
	"session_hash" text NOT NULL,
	"intent" jsonb NOT NULL,
	"evidence" jsonb,
	"claim" jsonb,
	"envelope" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "farcaster_attempts_ready_check" CHECK (("claim" is null) = ("evidence" is null)),
	CONSTRAINT "farcaster_attempts_published_check" CHECK ("envelope" is null or "claim" is not null)
);
--> statement-breakpoint
CREATE INDEX "farcaster_attempts_expiry_idx" ON "farcaster_attempts" ("expires_at");