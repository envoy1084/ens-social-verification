CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY,
	"nonce_hash" text NOT NULL UNIQUE,
	"browser_token_hash" text NOT NULL,
	"message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY,
	"token_hash" text NOT NULL UNIQUE,
	"wallet_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "auth_challenges_expiry_idx" ON "auth_challenges" ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" ("expires_at");