import { Schema } from "effect";

import { CredentialHash } from "../schema/auth.js";
import { EmailAttemptId, EmailIntent, EmailEvidence, EmailEnvelope } from "../schema/email.js";
import { VerificationClaim } from "../schema/verification.js";

export const EmailAttempt = Schema.Struct({
  id: EmailAttemptId,
  sessionHash: CredentialHash,
  intent: EmailIntent,
  evidence: Schema.NullOr(EmailEvidence),
  claim: Schema.NullOr(VerificationClaim),
  envelope: Schema.NullOr(EmailEnvelope),
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});
export type EmailAttempt = typeof EmailAttempt.Type;
