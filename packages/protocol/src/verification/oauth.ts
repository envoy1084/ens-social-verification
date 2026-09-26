import type { OAuthIdentity } from "../schema/oauth.js";
import type { VerificationClaim } from "../schema/verification.js";
import { hashVerificationClaim } from "./typed-data.js";

export const oauthMethod = "oauth.attestation.v1";

export function oauthTarget(identity: OAuthIdentity, attemptId: string) {
  return `oauth:${encodeURIComponent(identity.provider)}:${encodeURIComponent(identity.issuer)}:${encodeURIComponent(identity.subject)}:${attemptId}`;
}

export function oauthAttestationMessage(claim: VerificationClaim, proofUri: string) {
  return `ENS OAuth attestation v1\n${hashVerificationClaim(claim)}\n${proofUri}`;
}
