import { hashTypedData } from "viem";

import type { VerificationClaim } from "../schema/verification.js";

// Experimental Sepolia profile, not the proposal's mainnet domain.
export const verificationDomain = {
  name: "ENS Record Verification",
  version: "1",
  chainId: 11155111,
} as const;

export const verificationTypes = {
  ENSRecordVerification: [
    { name: "name", type: "string" },
    { name: "node", type: "bytes32" },
    { name: "recordType", type: "string" },
    { name: "recordKey", type: "string" },
    { name: "valueHash", type: "bytes32" },
    { name: "authorityVersion", type: "uint32" },
    { name: "authority", type: "address" },
    { name: "method", type: "string" },
    { name: "target", type: "string" },
    { name: "issuedAt", type: "uint64" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

export function getVerificationTypedData(claim: VerificationClaim) {
  return {
    domain: verificationDomain,
    types: verificationTypes,
    primaryType: "ENSRecordVerification" as const,
    message: {
      ...claim,
      authorityVersion: 2,
      issuedAt: BigInt(claim.issuedAt),
      validUntil: BigInt(claim.validUntil),
    },
  };
}

export function hashVerificationClaim(claim: VerificationClaim) {
  return hashTypedData(getVerificationTypedData(claim));
}
