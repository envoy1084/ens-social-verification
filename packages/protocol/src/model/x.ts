import { Schema } from "effect";

import { CredentialHash } from "../schema/auth.js";
import { EthereumAddress } from "../schema/evm.js";
import { VerificationClaim } from "../schema/verification.js";
import { XAttemptId, XEnvelope, XPostId, XIdentity, XLogin, XName } from "../schema/x.js";

export const XAttempt = Schema.Struct({
  id: XAttemptId,
  name: XName,
  walletAddress: EthereumAddress,
  sessionHash: CredentialHash,
  stateHash: CredentialHash,
  pkceChallenge: Schema.String,
  status: Schema.Literals(["pending", "processing", "ready", "publishing"]),
  encryptedToken: Schema.NullOr(Schema.String),
  identity: Schema.NullOr(XIdentity),
  claim: Schema.NullOr(VerificationClaim),
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});
export type XAttempt = typeof XAttempt.Type;
export const XPublication = Schema.Struct({
  id: XAttemptId,
  name: XName,
  login: XLogin,
  postId: XPostId,
  envelope: XEnvelope,
  createdAt: Schema.Date,
});
export type XPublication = typeof XPublication.Type;
