import { Schema } from "effect";

import { EthereumAddress } from "./evm.js";
import { VerificationClaim, VerificationSignature, VerificationTimestamp } from "./verification.js";

export const FarcasterAttemptId = Schema.String.check(Schema.isUUID());
export const FarcasterName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255));
export const FarcasterUsername = Schema.String.check(
  Schema.isPattern(/^(?:[a-z0-9][a-z0-9-]{0,15}|fid:[1-9][0-9]{0,15})$/),
);
export const FarcasterFid = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
export const FarcasterIntent = Schema.Struct({
  id: FarcasterAttemptId,
  name: FarcasterName,
  authority: EthereumAddress,
  domain: Schema.String.check(Schema.isMaxLength(255)),
  uri: Schema.String.check(Schema.isMaxLength(512)),
  issuedAt: VerificationTimestamp,
  validUntil: VerificationTimestamp,
});
export type FarcasterIntent = typeof FarcasterIntent.Type;
export const FarcasterEvidence = Schema.Struct({
  intent: FarcasterIntent,
  fid: FarcasterFid,
  username: FarcasterUsername,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  signature: VerificationSignature,
});
export type FarcasterEvidence = typeof FarcasterEvidence.Type;
export const FarcasterEnvelope = Schema.Struct({
  v: Schema.Literal("ensrv1"),
  claim: VerificationClaim,
  authoritySignature: VerificationSignature,
  proof: FarcasterEvidence,
});
export type FarcasterEnvelope = typeof FarcasterEnvelope.Type;
