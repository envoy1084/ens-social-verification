import { Clock, Effect, Schema } from "effect";

import {
  hashTextRecordValue,
  parseVerificationDescriptor,
  validateDescriptorMethod,
  validateVerificationClaim,
  validateClaimLifetime,
} from "@ens-social-verification/protocol";
import { VerificationError } from "@ens-social-verification/protocol/errors";
import { VerificationEnvelope } from "@ens-social-verification/protocol/schema";

import { resolveEnsV2Authority } from "./authority.js";
import { readVerificationRecords } from "./records.js";
import { verifyAuthoritySignature } from "./signature.js";
import { createVerificationSnapshot, assertVerificationSnapshot } from "./snapshot.js";

// Checks the ENS side only. A method verifier must still authenticate target evidence.
export const validateRecordAuthority = Effect.fn("validateRecordAuthority")(function* (input: {
  readonly name: string;
  readonly recordKey: string;
  readonly envelope: unknown;
  readonly method: string;
  readonly uriPolicy: "required" | "forbidden";
  readonly deriveTarget: (value: string) => Effect.Effect<string, VerificationError>;
}) {
  const envelope = yield* Schema.decodeUnknownEffect(VerificationEnvelope)(input.envelope, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      () => new VerificationError({ code: "INVALID_CLAIM", message: "Invalid proof envelope" }),
    ),
  );
  const claim = yield* validateVerificationClaim(envelope.claim);
  const snapshot = yield* createVerificationSnapshot();
  const authority = yield* resolveEnsV2Authority(input.name, snapshot);
  const records = yield* readVerificationRecords(authority.name, input.recordKey, snapshot);
  const descriptor = yield* parseVerificationDescriptor(records.descriptor);
  yield* validateDescriptorMethod(descriptor, input.method, input.uriPolicy);
  const target = yield* input.deriveTarget(records.value);
  const valueHash = yield* Effect.try({
    try: () => hashTextRecordValue(records.value),
    catch: () =>
      new VerificationError({ code: "INVALID_CLAIM", message: "Invalid live record encoding" }),
  });
  if (
    claim.name !== authority.name ||
    claim.recordKey !== records.recordKey ||
    claim.valueHash.toLowerCase() !== valueHash ||
    claim.method !== descriptor.method ||
    claim.target !== target
  ) {
    return yield* new VerificationError({
      code: "RECORD_MISMATCH",
      message: "Claim does not match the live ENS record",
    });
  }
  yield* verifyAuthoritySignature(
    claim,
    envelope.authoritySignature,
    authority.authority,
    snapshot,
  );
  const checkedAt = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));
  const validUntil = yield* validateClaimLifetime(claim, checkedAt, authority.authorityValidUntil);
  yield* assertVerificationSnapshot(snapshot);
  return { claim, descriptor, authority, records, checkedAt, validUntil, proof: envelope.proof };
});
