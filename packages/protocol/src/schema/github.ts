import { Schema } from "effect";

import { VerificationClaim, VerificationSignature } from "./verification.js";

export const GithubLogin = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/),
);
export const GithubId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/));
export const GithubAttemptId = Schema.String.check(Schema.isUUID());
export const GithubName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255));
export const GithubIdentity = Schema.Struct({ id: GithubId, login: GithubLogin });
export const GithubGistId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{20,32}$/));
export const GithubEvidence = Schema.Struct({
  githubId: GithubId,
  login: GithubLogin,
});
export const GithubEnvelope = Schema.Struct({
  v: Schema.Literal("ensrv1"),
  claim: VerificationClaim,
  authoritySignature: VerificationSignature,
  proof: GithubEvidence,
});
export type GithubEnvelope = typeof GithubEnvelope.Type;
