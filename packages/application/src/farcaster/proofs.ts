import { Clock, Context, Effect, Layer, Schema } from "effect";

import { FarcasterAttemptRepository } from "@ens-social-verification/database";
import {
  farcasterMethod,
  farcasterRecordKey,
  farcasterTarget,
  formatVerificationDescriptor,
  parseVerificationDescriptor,
  validateClaimLifetime,
} from "@ens-social-verification/protocol";
import { FarcasterError, VerificationError } from "@ens-social-verification/protocol/errors";
import { FarcasterAttemptId, FarcasterEnvelope } from "@ens-social-verification/protocol/schema";

import { Auth } from "../auth/index.js";
import { validateRecordAuthority } from "../verification/claim.js";
import { VerificationClient } from "../verification/client.js";
import { readVerificationRecords } from "../verification/records.js";
import { verifyAuthoritySignature } from "../verification/signature.js";
import {
  createVerificationSnapshot,
  assertVerificationSnapshot,
} from "../verification/snapshot.js";
import { FarcasterAuthority } from "./authority.js";
import { FarcasterConfig } from "./config.js";
import { FarcasterConnection } from "./connection.js";
import { FarcasterProvider } from "./provider.js";

const make = Effect.gen(function* () {
  const attempts = yield* FarcasterAttemptRepository;
  const connection = yield* FarcasterConnection;
  const authority = yield* FarcasterAuthority;
  const provider = yield* FarcasterProvider;
  const config = yield* FarcasterConfig;
  const sdk = yield* VerificationClient;
  const auth = yield* Auth;

  const evidence = Effect.fn("FarcasterProofs.evidence")(function* (envelope: FarcasterEnvelope) {
    const { claim, proof } = envelope;
    if (
      proof.intent.name !== claim.name ||
      proof.intent.authority.toLowerCase() !== claim.authority.toLowerCase() ||
      proof.intent.issuedAt !== claim.issuedAt ||
      proof.intent.validUntil !== claim.validUntil ||
      claim.target !== farcasterTarget(proof)
    )
      return yield* new FarcasterError({
        code: "INVALID_PROOF",
        message: "Farcaster approval is not bound to this ENS claim.",
      });
    const fid = yield* provider.verify(proof.intent, proof.message, proof.signature);
    if (fid !== proof.fid)
      return yield* new FarcasterError({
        code: "INVALID_PROOF",
        message: "Farcaster identity changed.",
      });
    yield* provider.verifyUsername(proof.username, fid);
  });
  const publication = Effect.fn("FarcasterProofs.publication")(function* (
    id: string,
    envelope: FarcasterEnvelope,
  ) {
    const proofUri = `${config.proofOrigin}/verification/farcaster/proofs/${id}`;
    return {
      name: envelope.claim.name,
      username: envelope.proof.username,
      proofUri,
      descriptor: yield* formatVerificationDescriptor({
        authorityVersion: 2,
        method: farcasterMethod,
        proofUri,
      }),
    };
  });

  return {
    remove: Effect.fn("FarcasterProofs.remove")(function* (
      name: string,
      proofUri: string,
      token: string | undefined,
    ) {
      const session = yield* auth.session(token);
      const owner = yield* authority.check(name, session.address);
      const prefix = `${config.proofOrigin}/verification/farcaster/proofs/`;
      if (!proofUri.startsWith(prefix))
        return yield* new FarcasterError({
          code: "INVALID_PROOF",
          message: "Unsupported Farcaster proof host.",
        });
      const id = yield* Schema.decodeUnknownEffect(FarcasterAttemptId)(
        proofUri.slice(prefix.length),
      ).pipe(
        Effect.mapError(
          () =>
            new FarcasterError({ code: "INVALID_PROOF", message: "Invalid Farcaster proof URL." }),
        ),
      );
      const records = yield* sdk.records.getTexts
        .effect({
          name: owner.name,
          keys: [farcasterRecordKey, "verification[text][xyz.farcaster]"],
          blockNumber: owner.snapshot.number,
        })
        .pipe(
          Effect.mapError(
            () =>
              new FarcasterError({
                code: "UNAVAILABLE",
                message: "Cannot confirm record removal. The hosted proof was kept.",
              }),
          ),
        );
      yield* assertVerificationSnapshot(owner.snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
      );
      if (records.length !== 2 || records.some((record) => record.value))
        return yield* new FarcasterError({
          code: "INVALID_ATTEMPT",
          message: "Clear both Farcaster records before removing the hosted proof.",
        });
      const envelope = yield* attempts.proof(id);
      if (envelope && envelope.claim.name !== owner.name)
        return yield* new FarcasterError({
          code: "FORBIDDEN",
          message: "This proof belongs to another ENS name.",
        });
      yield* attempts.remove(id, owner.name);
      return { deleted: true as const };
    }),
    proof: Effect.fn("FarcasterProofs.proof")(function* (id: string) {
      const envelope = yield* attempts.proof(id);
      if (!envelope)
        return yield* new FarcasterError({
          code: "INVALID_PROOF",
          message: "Farcaster proof not found.",
        });
      return envelope;
    }),
    publish: Effect.fn("FarcasterProofs.publish")(
      function* (id: string, signature: string, token: string | undefined) {
        const attempt = yield* connection.attempt(id, token);
        if (attempt.envelope) return yield* publication(id, attempt.envelope);
        if (!attempt.claim || !attempt.evidence)
          return yield* new FarcasterError({
            code: "INVALID_ATTEMPT",
            message: "Approve Farcaster before publishing the proof.",
          });
        const owner = yield* authority.check(attempt.intent.name, attempt.intent.authority);
        yield* validateClaimLifetime(
          attempt.claim,
          BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000)),
          owner.authorityValidUntil,
        );
        yield* verifyAuthoritySignature(attempt.claim, signature, owner.authority, owner.snapshot);
        const envelope = yield* Schema.decodeUnknownEffect(FarcasterEnvelope)({
          v: "ensrv1",
          claim: attempt.claim,
          authoritySignature: signature,
          proof: attempt.evidence,
        });
        yield* evidence(envelope);
        yield* connection.attempt(id, token);
        const stored = yield* attempts.publish(id, attempt.sessionHash, envelope);
        return yield* publication(id, stored);
      },
      Effect.provideService(VerificationClient, sdk),
    ),
    status: Effect.fn("FarcasterProofs.status")(
      function* (name: string) {
        const snapshot = yield* createVerificationSnapshot();
        const records = yield* readVerificationRecords(name, farcasterRecordKey, snapshot);
        const descriptor = yield* parseVerificationDescriptor(records.descriptor);
        if (descriptor.method !== farcasterMethod || !descriptor.proofUri)
          return yield* new FarcasterError({
            code: "INVALID_PROOF",
            message: "No Farcaster proof is linked.",
          });
        const prefix = `${config.proofOrigin}/verification/farcaster/proofs/`;
        if (!descriptor.proofUri.startsWith(prefix))
          return yield* new FarcasterError({
            code: "INVALID_PROOF",
            message: "Unsupported Farcaster proof host.",
          });
        const id = yield* Schema.decodeUnknownEffect(FarcasterAttemptId)(
          descriptor.proofUri.slice(prefix.length),
        ).pipe(
          Effect.mapError(
            () =>
              new FarcasterError({
                code: "INVALID_PROOF",
                message: "Invalid Farcaster proof URL.",
              }),
          ),
        );
        const envelope = yield* attempts.proof(id);
        if (!envelope)
          return yield* new FarcasterError({
            code: "INVALID_PROOF",
            message: "Farcaster proof not found.",
          });
        yield* evidence(envelope);
        const verified = yield* validateRecordAuthority({
          name,
          recordKey: farcasterRecordKey,
          envelope,
          method: farcasterMethod,
          uriPolicy: "required",
          deriveTarget: (value) =>
            value === envelope.proof.username
              ? Effect.succeed(farcasterTarget(envelope.proof))
              : Effect.fail(
                  new VerificationError({
                    code: "RECORD_MISMATCH",
                    message: "Farcaster record does not match the signed account.",
                  }),
                ),
        });
        if (verified.descriptor.proofUri !== descriptor.proofUri)
          return yield* new FarcasterError({
            code: "INVALID_PROOF",
            message: "Farcaster proof changed during verification.",
          });
        return {
          status: "verified" as const,
          username: envelope.proof.username,
          proofUri: descriptor.proofUri,
          validUntil: String(verified.validUntil),
          reason: null,
        };
      },
      Effect.provideService(VerificationClient, sdk),
      Effect.catch((error) => {
        if (
          (Schema.is(FarcasterError)(error) && error.code !== "UNAVAILABLE") ||
          (Schema.is(VerificationError)(error) &&
            error.code !== "DEPENDENCY_UNAVAILABLE" &&
            error.code !== "STALE_SNAPSHOT")
        )
          return Effect.succeed({
            status: "unverified" as const,
            username: null,
            proofUri: null,
            validUntil: null,
            reason: error.message,
          });
        return Effect.fail(error);
      }),
    ),
  };
});

export class FarcasterProofs extends Context.Service<
  FarcasterProofs,
  Effect.Success<typeof make>
>()("application/FarcasterProofs") {
  static readonly layer = Layer.effect(FarcasterProofs, make);
}
