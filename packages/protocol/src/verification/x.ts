import type { VerificationClaim } from "../schema/verification.js";
import { hashVerificationClaim } from "./typed-data.js";

export const xMethod = "x.post.v1";
export const xRecordKey = "com.twitter";

export function xProofPost(claim: VerificationClaim) {
  return `Verifying my ENS identity.\nENS proof: ${hashVerificationClaim(claim)}`;
}
