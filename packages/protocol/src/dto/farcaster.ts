import { Schema } from "effect";

import {
  FarcasterAttemptId,
  FarcasterIntent,
  FarcasterName,
  FarcasterUsername,
} from "../schema/farcaster.js";
import {
  VerificationClaim,
  VerificationSignature,
  VerificationTimestamp,
} from "../schema/verification.js";

export const FarcasterStartRequest = Schema.Struct({ name: FarcasterName });
export const FarcasterStartResponse = Schema.Struct({
  id: FarcasterAttemptId,
  intent: FarcasterIntent,
  nonce: Schema.String,
});
export const FarcasterCompleteRequest = Schema.Struct({
  message: Schema.String.check(Schema.isMaxLength(4096)),
  signature: VerificationSignature,
  username: Schema.String.check(Schema.isMaxLength(255)),
});
export const FarcasterReadyResponse = Schema.Struct({
  claim: VerificationClaim,
  username: FarcasterUsername,
});
export const FarcasterPublishRequest = Schema.Struct({ authoritySignature: VerificationSignature });
export const FarcasterPublication = Schema.Struct({
  name: FarcasterName,
  username: FarcasterUsername,
  proofUri: Schema.String,
  descriptor: Schema.String,
});
export const FarcasterStatusResponse = Schema.Struct({
  status: Schema.Literals(["verified", "unverified"]),
  username: Schema.NullOr(FarcasterUsername),
  proofUri: Schema.NullOr(Schema.String),
  validUntil: Schema.NullOr(VerificationTimestamp),
  reason: Schema.NullOr(Schema.String),
});
