import { Schema } from "effect";

import { VerificationClaim, VerificationSignature } from "./verification.js";

export const XLogin = Schema.String.check(Schema.isPattern(/^[a-z0-9_]{1,15}$/));
export const XId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,19}$/));
export const XAttemptId = Schema.String.check(Schema.isUUID());
export const XName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255));
export const XIdentity = Schema.Struct({ id: XId, login: XLogin });
export const XPostId = XId;
export const XEvidence = Schema.Struct({
  xId: XId,
  login: XLogin,
  attemptId: XAttemptId,
  postId: XPostId,
});
export const XEnvelope = Schema.Struct({
  v: Schema.Literal("ensrv1"),
  claim: VerificationClaim,
  authoritySignature: VerificationSignature,
  proof: XEvidence,
});
export type XEnvelope = typeof XEnvelope.Type;
