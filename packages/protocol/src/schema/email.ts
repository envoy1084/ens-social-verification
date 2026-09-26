import { Schema } from "effect";

import { EthereumAddress } from "./evm.js";
import { VerificationClaim, VerificationSignature, VerificationTimestamp } from "./verification.js";

export const EmailAttemptId = Schema.String.check(Schema.isUUID());
export const EmailName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255));
// This profile preserves the local part and supports unquoted ASCII mailboxes only.
export const EmailAddress = Schema.String.check(
  Schema.isMaxLength(254),
  Schema.isPattern(
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
  ),
);
export const EmailIntent = Schema.Struct({
  id: EmailAttemptId,
  name: EmailName,
  authority: EthereumAddress,
  email: EmailAddress,
  recipient: EmailAddress,
  issuedAt: VerificationTimestamp,
  validUntil: VerificationTimestamp,
});
export type EmailIntent = typeof EmailIntent.Type;
export const EmailEvidence = Schema.Struct({
  intent: EmailIntent,
  rawEmail: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(350_000),
    Schema.isPattern(/^[A-Za-z0-9+/]+={0,2}$/),
  ),
});
export type EmailEvidence = typeof EmailEvidence.Type;
export const EmailEnvelope = Schema.Struct({
  v: Schema.Literal("ensrv1"),
  claim: VerificationClaim,
  authoritySignature: VerificationSignature,
  proof: EmailEvidence,
});
export type EmailEnvelope = typeof EmailEnvelope.Type;
