import { Schema } from "effect";

import { CredentialHash } from "../schema/auth.js";
import { EthereumAddress } from "../schema/evm.js";
import {
  GithubAttemptId,
  GithubGistId,
  GithubIdentity,
  GithubLogin,
  GithubName,
} from "../schema/github.js";
import { VerificationClaim } from "../schema/verification.js";

export const GithubAttempt = Schema.Struct({
  id: GithubAttemptId,
  name: GithubName,
  walletAddress: EthereumAddress,
  sessionHash: CredentialHash,
  stateHash: CredentialHash,
  pkceChallenge: Schema.String,
  status: Schema.Literals(["pending", "processing", "ready", "publishing"]),
  encryptedToken: Schema.NullOr(Schema.String),
  identity: Schema.NullOr(GithubIdentity),
  claim: Schema.NullOr(VerificationClaim),
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});
export type GithubAttempt = typeof GithubAttempt.Type;
export const GithubPublication = Schema.Struct({
  id: GithubAttemptId,
  name: GithubName,
  login: GithubLogin,
  gistId: GithubGistId,
  createdAt: Schema.Date,
});
export type GithubPublication = typeof GithubPublication.Type;
