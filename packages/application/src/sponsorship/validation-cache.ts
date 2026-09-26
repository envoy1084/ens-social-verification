import { keccak256, type Address, type Hex } from "viem";

import type { VerificationSnapshot } from "../verification/snapshot.js";

interface ValidationIdentity {
  readonly snapshot: VerificationSnapshot;
  readonly name: string;
  readonly owner: Address;
  readonly sender: string;
  readonly nonce: string;
  readonly callData: string;
}

function validationKey(identity: ValidationIdentity) {
  return JSON.stringify([
    identity.snapshot.hash,
    identity.snapshot.number.toString(),
    identity.name,
    identity.owner.toLowerCase(),
    identity.sender.toLowerCase(),
    BigInt(identity.nonce).toString(),
    keccak256(identity.callData as Hex),
  ]);
}

/** Only successful chain authorization is reusable; request/fee checks stay outside. */
export function createSponsorshipValidationCache() {
  const entries = new Map<string, number>();
  return {
    has: (identity: ValidationIdentity) => {
      const now = Date.now();
      for (const [key, expires] of entries) if (expires <= now) entries.delete(key);
      return entries.has(validationKey(identity));
    },
    remember: (identity: ValidationIdentity, authorityValidUntil: bigint) => {
      const key = validationKey(identity);
      const oldest = entries.keys().next().value;
      if (entries.size >= 64 && oldest !== undefined) entries.delete(oldest);
      entries.set(key, Math.min(Date.now() + 30_000, Number(authorityValidUntil) * 1000));
    },
  };
}
