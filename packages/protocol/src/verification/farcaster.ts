import { encodeAbiParameters, keccak256, stringToHex } from "viem";

import type { FarcasterEvidence, FarcasterIntent } from "../schema/farcaster.js";

export const farcasterMethod = "farcaster.siwf.v1";
export const farcasterRecordKey = "xyz.farcaster";
export const farcasterVerificationKey = "verification[text][xyz.farcaster]";

export function farcasterNonce(intent: FarcasterIntent) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "string" },
        { type: "string" },
        { type: "address" },
        { type: "string" },
        { type: "string" },
        { type: "uint64" },
        { type: "uint64" },
      ],
      [
        "ensrv1:2:xyz.farcaster:farcaster.siwf.v1",
        11155111n,
        intent.id,
        intent.name,
        intent.authority,
        intent.domain,
        intent.uri,
        BigInt(intent.issuedAt),
        BigInt(intent.validUntil),
      ],
    ),
  ).slice(2);
}

export function farcasterTarget(proof: FarcasterEvidence) {
  return `farcaster:fid:${proof.fid}:siwf:${keccak256(stringToHex(proof.message))}`;
}
