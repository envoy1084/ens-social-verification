import { Schema } from "effect";

import { VerificationClaim, VerificationSignature } from "../schema/verification.js";
import { XAttemptId, XIdentity, XName } from "../schema/x.js";

export const XStartRequest = Schema.Struct({ name: XName });
export const XStartResponse = Schema.Struct({
  id: XAttemptId,
  authorizeUrl: Schema.String,
});
export const XAttemptResponse = Schema.Struct({
  id: XAttemptId,
  name: XName,
  status: Schema.Literals(["pending", "processing", "ready", "publishing"]),
  identity: Schema.NullOr(XIdentity),
  claim: Schema.NullOr(VerificationClaim),
  expiresAt: Schema.String,
});
export const XFinalizeRequest = Schema.Struct({ authoritySignature: VerificationSignature });
export const XPublishResponse = Schema.Struct({
  id: XAttemptId,
  name: XName,
  login: Schema.String,
  descriptor: Schema.String,
  proofUri: Schema.String,
  postUri: Schema.String,
});
export const XStatusResponse = Schema.Struct({
  status: Schema.Literals(["verified", "unverified"]),
  login: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(Schema.String),
  proofUri: Schema.NullOr(Schema.String),
  validUntil: Schema.NullOr(Schema.String),
});
export const XConfiguration = Schema.Struct({
  enabled: Schema.Boolean,
});
export const XRemovalRequest = Schema.Struct({
  name: XName,
  proofUri: Schema.String.check(Schema.isMaxLength(256)),
});
export const XRemovalOptions = Schema.Struct({ canDeletePost: Schema.Boolean });
export const XRemovalResponse = Schema.Struct({
  deleted: Schema.Boolean,
  message: Schema.String,
});
