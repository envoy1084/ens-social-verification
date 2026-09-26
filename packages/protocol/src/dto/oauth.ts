import { Schema } from "effect";

import { EthereumAddress } from "../schema/evm.js";
import { OAuthAttemptId, OAuthIdentity, OAuthName, OAuthProviderId } from "../schema/oauth.js";
import { VerificationClaim, VerificationSignature } from "../schema/verification.js";

export const OAuthConfiguration = Schema.Struct({
  enabled: Schema.Boolean,
  provider: OAuthProviderId,
  recordKey: Schema.String,
  attestor: Schema.NullOr(EthereumAddress),
});
export const OAuthStartRequest = Schema.Struct({ name: OAuthName });
export const OAuthStartResponse = Schema.Struct({
  id: OAuthAttemptId,
  authorizeUrl: Schema.String,
});
export const OAuthPublication = Schema.Struct({
  id: OAuthAttemptId,
  name: OAuthName,
  provider: OAuthProviderId,
  value: Schema.String,
  recordKey: Schema.String,
  descriptor: Schema.String,
  proofUri: Schema.String,
});
export const OAuthAttemptResponse = Schema.Struct({
  id: OAuthAttemptId,
  name: OAuthName,
  provider: OAuthProviderId,
  status: Schema.Literals(["pending", "processing", "ready"]),
  identity: Schema.NullOr(OAuthIdentity),
  claim: Schema.NullOr(VerificationClaim),
  publication: Schema.NullOr(OAuthPublication),
  expiresAt: Schema.String,
});
export const OAuthPublishRequest = Schema.Struct({ authoritySignature: VerificationSignature });
export const OAuthStatusResponse = Schema.Struct({
  status: Schema.Literals(["verified", "unverified"]),
  value: Schema.NullOr(Schema.String),
  proofUri: Schema.NullOr(Schema.String),
  validUntil: Schema.NullOr(Schema.String),
  attestor: Schema.NullOr(EthereumAddress),
  reason: Schema.NullOr(Schema.String),
});
export const OAuthRemovalRequest = Schema.Struct({
  name: OAuthName,
  proofUri: Schema.String.check(Schema.isMaxLength(512)),
});
export const OAuthRemovalResponse = Schema.Struct({ revoked: Schema.Boolean });
