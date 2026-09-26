import { Schema } from "effect";

import { EmailAddress, EmailAttemptId, EmailIntent, EmailName } from "../schema/email.js";
import {
  VerificationClaim,
  VerificationSignature,
  VerificationTimestamp,
} from "../schema/verification.js";

export const EmailStartRequest = Schema.Struct({ name: EmailName, email: EmailAddress });
export const EmailStartResponse = Schema.Struct({
  id: EmailAttemptId,
  intent: EmailIntent,
  subject: Schema.String,
});
export const EmailReadyResponse = Schema.Struct({
  ready: Schema.Boolean,
  claim: Schema.NullOr(VerificationClaim),
  email: EmailAddress,
  reason: Schema.NullOr(Schema.String),
});
export const EmailPublishRequest = Schema.Struct({
  authoritySignature: VerificationSignature,
  consent: Schema.Literal(true),
});
export const EmailPublication = Schema.Struct({
  name: EmailName,
  email: EmailAddress,
  proofUri: Schema.String,
  descriptor: Schema.String,
});
export const EmailStatusResponse = Schema.Struct({
  status: Schema.Literals(["verified", "unverified"]),
  email: Schema.NullOr(EmailAddress),
  proofUri: Schema.NullOr(Schema.String),
  validUntil: Schema.NullOr(VerificationTimestamp),
  reason: Schema.NullOr(Schema.String),
});
export const EmailRemovalRequest = Schema.Struct({
  name: EmailName,
  proofUri: Schema.String.check(Schema.isMaxLength(1024)),
});
export const EmailRemovalResponse = Schema.Struct({ deleted: Schema.Literal(true) });
export const EmailPreviewResponse = Schema.Struct({ rawEmail: Schema.String });
