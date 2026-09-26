import { Effect, Schema } from "effect";

import { normalizeName, namehash } from "@ensforge/core";
import { keccak256, stringToHex, zeroAddress } from "viem";

import { VerificationError } from "../errors/verification.js";
import { VerificationClaim } from "../schema/verification.js";

export const normalizeVerificationName = Effect.fn("normalizeVerificationName")(function* (
  input: string,
) {
  const name = yield* normalizeName
    .effect(input)
    .pipe(
      Effect.mapError(
        () => new VerificationError({ code: "INVALID_CLAIM", message: "Invalid ENS name" }),
      ),
    );
  const labels = name.split(".");
  if (labels.length !== 2 || labels[1] !== "eth") {
    return yield* new VerificationError({
      code: "UNSUPPORTED_AUTHORITY",
      message: "Only exact second-level ENSv2 .eth names are supported",
    });
  }
  return name;
});

export function hashTextRecordValue(value: string) {
  if (/[\uD800-\uDFFF]/u.test(value))
    throw new VerificationError({
      code: "INVALID_CLAIM",
      message: "Record value contains invalid Unicode",
    });
  return keccak256(stringToHex(value));
}

export const validateVerificationClaim = Effect.fn("validateVerificationClaim")(function* (
  input: unknown,
) {
  const claim = yield* Schema.decodeUnknownEffect(VerificationClaim)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      () => new VerificationError({ code: "INVALID_CLAIM", message: "Invalid verification claim" }),
    ),
  );
  const name = yield* normalizeVerificationName(claim.name);
  if (
    name !== claim.name ||
    namehash(name).toLowerCase() !== claim.node.toLowerCase() ||
    claim.authority.toLowerCase() === zeroAddress ||
    BigInt(claim.issuedAt) >= BigInt(claim.validUntil) ||
    /[\uD800-\uDFFF]/u.test(claim.target) ||
    /[\uD800-\uDFFF]/u.test(claim.recordKey)
  ) {
    return yield* new VerificationError({
      code: "INVALID_CLAIM",
      message: "Claim identity or validity interval is inconsistent",
    });
  }
  return claim;
});

export const createVerificationClaim = Effect.fn("createVerificationClaim")(function* (
  input: Omit<VerificationClaim, "node" | "valueHash" | "recordType" | "authorityVersion"> & {
    readonly value: string;
  },
) {
  const name = yield* normalizeVerificationName(input.name);
  const valueHash = yield* Effect.try({
    try: () => hashTextRecordValue(input.value),
    catch: () => new VerificationError({ code: "INVALID_CLAIM", message: "Invalid text value" }),
  });
  return yield* validateVerificationClaim({
    name,
    node: namehash(name),
    recordType: "text",
    recordKey: input.recordKey,
    valueHash,
    authorityVersion: "2",
    authority: input.authority,
    method: input.method,
    target: input.target,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
  });
});

export const validateClaimLifetime = Effect.fn("validateClaimLifetime")(function* (
  claim: VerificationClaim,
  checkedAt: bigint,
  authorityValidUntil: bigint,
) {
  if (
    BigInt(claim.issuedAt) > checkedAt + 300n ||
    checkedAt >= BigInt(claim.validUntil) ||
    checkedAt >= authorityValidUntil
  ) {
    return yield* new VerificationError({
      code: "INVALID_CLAIM",
      message: "Claim or authority is outside its validity window",
    });
  }
  return BigInt(claim.validUntil) < authorityValidUntil
    ? BigInt(claim.validUntil)
    : authorityValidUntil;
});
