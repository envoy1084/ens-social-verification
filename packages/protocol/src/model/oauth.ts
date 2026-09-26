import { Schema } from "effect";

import { CredentialHash } from "../schema/auth.js";
import { EthereumAddress } from "../schema/evm.js";
import {
  OAuthAttemptId,
  OAuthEnvelope,
  OAuthIdentity,
  OAuthName,
  OAuthProviderId,
} from "../schema/oauth.js";
import { VerificationClaim } from "../schema/verification.js";

export const OAuthAttempt = Schema.Struct({
  id: OAuthAttemptId,
  provider: OAuthProviderId,
  name: OAuthName,
  walletAddress: EthereumAddress,
  sessionHash: CredentialHash,
  stateHash: CredentialHash,
  pkceChallenge: Schema.String,
  status: Schema.Literals(["pending", "processing", "ready"]),
  identity: Schema.NullOr(OAuthIdentity),
  claim: Schema.NullOr(VerificationClaim),
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});
export type OAuthAttempt = typeof OAuthAttempt.Type;
export const OAuthAttestation = Schema.Struct({
  id: OAuthAttemptId,
  envelope: OAuthEnvelope,
  createdAt: Schema.Date,
  revokedAt: Schema.NullOr(Schema.Date),
});
export type OAuthAttestation = typeof OAuthAttestation.Type;
