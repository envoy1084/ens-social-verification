import { Clock, Context, Effect, Layer, Schema } from "effect";

import { EmailAttemptRepository } from "@ens-social-verification/database";
import {
  emailMethod,
  emailRecordKey,
  emailTarget,
  formatVerificationDescriptor,
  parseVerificationDescriptor,
  validateClaimLifetime,
} from "@ens-social-verification/protocol";
import { EmailError, VerificationError } from "@ens-social-verification/protocol/errors";
import { EmailAttemptId, EmailEnvelope } from "@ens-social-verification/protocol/schema";

import { Auth } from "../auth/index.js";
import { validateRecordAuthority } from "../verification/claim.js";
import { VerificationClient } from "../verification/client.js";
import { readVerificationRecords } from "../verification/records.js";
import { verifyAuthoritySignature } from "../verification/signature.js";
import {
  createVerificationSnapshot,
  assertVerificationSnapshot,
} from "../verification/snapshot.js";
import { EmailAuthority } from "./authority.js";
import { EmailConfig } from "./config.js";
import { EmailConnection } from "./connection.js";
import { verifyEmailDkim } from "./dkim.js";

const make = Effect.gen(function* () {
  const attempts = yield* EmailAttemptRepository;
  const connection = yield* EmailConnection;
  const authority = yield* EmailAuthority;
  const config = yield* EmailConfig;
  const sdk = yield* VerificationClient;
  const auth = yield* Auth;

  const publication = Effect.fn("EmailProofs.publication")(function* (
    id: string,
    envelope: EmailEnvelope,
  ) {
    const proofUri = `${config.proofOrigin}/verification/email/proofs/${id}`;
    return {
      name: envelope.claim.name,
      email: envelope.proof.intent.email,
      proofUri,
      descriptor: yield* formatVerificationDescriptor({
        authorityVersion: 2,
        method: emailMethod,
        proofUri,
      }),
    };
  });

  return {
    remove: Effect.fn("EmailProofs.remove")(function* (
      name: string,
      proofUri: string,
      token: string | undefined,
    ) {
      const session = yield* auth.session(token);
      const owner = yield* authority.check(name, session.address);
      const prefix = `${config.proofOrigin}/verification/email/proofs/`;
      if (!proofUri.startsWith(prefix))
        return yield* new EmailError({
          code: "INVALID_PROOF",
          message: "Unsupported Email proof host.",
        });
      const id = yield* Schema.decodeUnknownEffect(EmailAttemptId)(
        proofUri.slice(prefix.length),
      ).pipe(
        Effect.mapError(
          () => new EmailError({ code: "INVALID_PROOF", message: "Invalid Email proof URL." }),
        ),
      );
      const records = yield* sdk.records.getTexts
        .effect({
          name: owner.name,
          keys: [emailRecordKey, "verification[text][email]"],
          blockNumber: owner.snapshot.number,
        })
        .pipe(
          Effect.mapError(
            () =>
              new EmailError({
                code: "UNAVAILABLE",
                message: "Cannot confirm record removal. The hosted proof was kept.",
              }),
          ),
        );
      yield* assertVerificationSnapshot(owner.snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
      );
      if (records.length !== 2 || records.some((record) => record.value))
        return yield* new EmailError({
          code: "INVALID_ATTEMPT",
          message: "Clear both Email records before removing the hosted proof.",
        });
      const envelope = yield* attempts.proof(id);
      if (envelope && envelope.claim.name !== owner.name)
        return yield* new EmailError({
          code: "FORBIDDEN",
          message: "This proof belongs to another ENS name.",
        });
      yield* attempts.remove(id, owner.name);
      return { deleted: true as const };
    }),
    proof: Effect.fn("EmailProofs.proof")(function* (id: string) {
      const envelope = yield* attempts.proof(id);
      if (!envelope)
        return yield* new EmailError({
          code: "INVALID_PROOF",
          message: "Email proof not found.",
        });
      return envelope;
    }),
    publish: Effect.fn("EmailProofs.publish")(
      function* (id: string, signature: string, token: string | undefined) {
        const attempt = yield* connection.attempt(id, token);
        if (attempt.envelope) return yield* publication(id, attempt.envelope);
        if (!attempt.claim || !attempt.evidence)
          return yield* new EmailError({
            code: "INVALID_ATTEMPT",
            message: "Approve Email before publishing the proof.",
          });
        const owner = yield* authority.check(attempt.intent.name, attempt.intent.authority);
        yield* validateClaimLifetime(
          attempt.claim,
          BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000)),
          owner.authorityValidUntil,
        );
        yield* verifyAuthoritySignature(attempt.claim, signature, owner.authority, owner.snapshot);
        const envelope = yield* Schema.decodeUnknownEffect(EmailEnvelope)({
          v: "ensrv1",
          claim: attempt.claim,
          authoritySignature: signature,
          proof: attempt.evidence,
        });
        yield* verifyEmailDkim(envelope.proof, envelope.claim);
        yield* connection.attempt(id, token);
        const stored = yield* attempts.publish(id, attempt.sessionHash, envelope);
        return yield* publication(id, stored);
      },
      Effect.provideService(VerificationClient, sdk),
    ),
    status: Effect.fn("EmailProofs.status")(
      function* (name: string) {
        const snapshot = yield* createVerificationSnapshot();
        const records = yield* readVerificationRecords(name, emailRecordKey, snapshot);
        const descriptor = yield* parseVerificationDescriptor(records.descriptor);
        if (descriptor.method !== emailMethod || !descriptor.proofUri)
          return yield* new EmailError({
            code: "INVALID_PROOF",
            message: "No Email proof is linked.",
          });
        const prefix = `${config.proofOrigin}/verification/email/proofs/`;
        if (!descriptor.proofUri.startsWith(prefix))
          return yield* new EmailError({
            code: "INVALID_PROOF",
            message: "Unsupported Email proof host.",
          });
        const id = yield* Schema.decodeUnknownEffect(EmailAttemptId)(
          descriptor.proofUri.slice(prefix.length),
        ).pipe(
          Effect.mapError(
            () =>
              new EmailError({
                code: "INVALID_PROOF",
                message: "Invalid Email proof URL.",
              }),
          ),
        );
        const envelope = yield* attempts.proof(id);
        if (!envelope)
          return yield* new EmailError({
            code: "INVALID_PROOF",
            message: "Email proof not found.",
          });
        yield* verifyEmailDkim(envelope.proof, envelope.claim);
        const verified = yield* validateRecordAuthority({
          name,
          recordKey: emailRecordKey,
          envelope,
          method: emailMethod,
          uriPolicy: "required",
          deriveTarget: (value) =>
            value === envelope.proof.intent.email
              ? Effect.succeed(emailTarget(envelope.proof.intent))
              : Effect.fail(
                  new VerificationError({
                    code: "RECORD_MISMATCH",
                    message: "Email record does not match the signed account.",
                  }),
                ),
        });
        if (verified.descriptor.proofUri !== descriptor.proofUri)
          return yield* new EmailError({
            code: "INVALID_PROOF",
            message: "Email proof changed during verification.",
          });
        return {
          status: "verified" as const,
          email: envelope.proof.intent.email,
          proofUri: descriptor.proofUri,
          validUntil: String(verified.validUntil),
          reason: null,
        };
      },
      Effect.provideService(VerificationClient, sdk),
      Effect.catch((error) => {
        if (
          (Schema.is(EmailError)(error) && error.code !== "UNAVAILABLE") ||
          (Schema.is(VerificationError)(error) &&
            error.code !== "DEPENDENCY_UNAVAILABLE" &&
            error.code !== "STALE_SNAPSHOT")
        )
          return Effect.succeed({
            status: "unverified" as const,
            email: null,
            proofUri: null,
            validUntil: null,
            reason: error.message,
          });
        return Effect.fail(error);
      }),
    ),
  };
});

export class EmailProofs extends Context.Service<EmailProofs, Effect.Success<typeof make>>()(
  "application/EmailProofs",
) {
  static readonly layer = Layer.effect(EmailProofs, make);
}
