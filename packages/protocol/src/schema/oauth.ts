import { Schema } from "effect";

import { EthereumAddress } from "./evm.js";
import { VerificationClaim, VerificationSignature } from "./verification.js";

export const OAuthProviderId = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,31}$/));
export const OAuthAttemptId = Schema.String.check(Schema.isUUID());
export const OAuthName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255));
export const OAuthIdentity = Schema.Struct({
  provider: OAuthProviderId,
  issuer: Schema.String.check(Schema.isMaxLength(256)),
  subject: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  value: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});
export type OAuthIdentity = typeof OAuthIdentity.Type;
export const OAuthEvidence = Schema.Struct({
  attemptId: OAuthAttemptId,
  identity: OAuthIdentity,
  attestor: EthereumAddress,
  signature: VerificationSignature,
});
export const OAuthEnvelope = Schema.Struct({
  v: Schema.Literal("ensrv1"),
  claim: VerificationClaim,
  authoritySignature: VerificationSignature,
  proof: OAuthEvidence,
});
export type OAuthEnvelope = typeof OAuthEnvelope.Type;
