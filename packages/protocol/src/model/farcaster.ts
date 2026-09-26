import { Schema } from "effect";

import { CredentialHash } from "../schema/auth.js";
import {
  FarcasterAttemptId,
  FarcasterIntent,
  FarcasterEvidence,
  FarcasterEnvelope,
} from "../schema/farcaster.js";
import { VerificationClaim } from "../schema/verification.js";

export const FarcasterAttempt = Schema.Struct({
  id: FarcasterAttemptId,
  sessionHash: CredentialHash,
  intent: FarcasterIntent,
  evidence: Schema.NullOr(FarcasterEvidence),
  claim: Schema.NullOr(VerificationClaim),
  envelope: Schema.NullOr(FarcasterEnvelope),
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});
export type FarcasterAttempt = typeof FarcasterAttempt.Type;
