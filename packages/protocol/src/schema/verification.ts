import { Schema } from "effect";

import { EthereumAddress, Hex } from "./evm.js";

export const VerificationMethod = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.isPattern(
    /^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z](?:[a-z0-9-]*[a-z0-9])?)*\.v[1-9][0-9]*$/,
  ),
);
export const VerificationRecordKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
  // Brackets would make the companion key ambiguous; control bytes are not record keys.
  // eslint-disable-next-line no-control-regex
  Schema.isPattern(/^[^[\]\x00-\x1f\x7f]+$/),
);
export const VerificationBytes32 = Hex.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/));
export const VerificationSignature = Hex.check(
  Schema.isPattern(/^0x(?:[0-9a-fA-F]{2})+$/),
  Schema.isMaxLength(32770),
);
export const VerificationTimestamp = Schema.String.check(
  Schema.isPattern(/^(0|[1-9][0-9]{0,19})$/),
  Schema.makeFilter((value) => BigInt(value) <= 18446744073709551615n),
);
export const VerificationDescriptor = Schema.Struct({
  authorityVersion: Schema.Literal(2),
  method: VerificationMethod,
  proofUri: Schema.optional(Schema.String),
});
export type VerificationDescriptor = typeof VerificationDescriptor.Type;

export const VerificationClaim = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  node: VerificationBytes32,
  recordType: Schema.Literal("text"),
  recordKey: VerificationRecordKey,
  valueHash: VerificationBytes32,
  authorityVersion: Schema.Literal("2"),
  authority: EthereumAddress,
  method: VerificationMethod,
  target: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048)),
  issuedAt: VerificationTimestamp,
  validUntil: VerificationTimestamp,
});
export type VerificationClaim = typeof VerificationClaim.Type;

// Method evidence remains unknown until a method-specific schema validates it.
export const VerificationEnvelope = Schema.Struct({
  v: Schema.Literal("ensrv1"),
  claim: VerificationClaim,
  authoritySignature: VerificationSignature,
  proof: Schema.Unknown,
});
export type VerificationEnvelope = typeof VerificationEnvelope.Type;
