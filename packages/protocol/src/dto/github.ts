import { Schema } from "effect";

import { GithubAttemptId, GithubIdentity, GithubName } from "../schema/github.js";
import { VerificationClaim, VerificationSignature } from "../schema/verification.js";

export const GithubStartRequest = Schema.Struct({ name: GithubName });
export const GithubStartResponse = Schema.Struct({
  id: GithubAttemptId,
  authorizeUrl: Schema.String,
});
export const GithubAttemptResponse = Schema.Struct({
  id: GithubAttemptId,
  name: GithubName,
  status: Schema.Literals(["pending", "processing", "ready", "publishing"]),
  identity: Schema.NullOr(GithubIdentity),
  claim: Schema.NullOr(VerificationClaim),
  expiresAt: Schema.String,
});
export const GithubFinalizeRequest = Schema.Struct({ authoritySignature: VerificationSignature });
export const GithubPublishResponse = Schema.Struct({
  id: GithubAttemptId,
  name: GithubName,
  login: Schema.String,
  descriptor: Schema.String,
  proofUri: Schema.String,
});
export const GithubStatusResponse = Schema.Struct({
  status: Schema.Literals(["verified", "unverified"]),
  login: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(Schema.String),
  proofUri: Schema.NullOr(Schema.String),
  validUntil: Schema.NullOr(Schema.String),
});
export const GithubConfiguration = Schema.Struct({
  enabled: Schema.Boolean,
});
