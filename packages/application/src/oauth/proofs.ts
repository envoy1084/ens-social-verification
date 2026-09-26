import { Clock, Context, Effect, Layer, Schema } from "effect";

import { OAuthAttestationRepository } from "@ens-social-verification/database";
import {
  formatVerificationDescriptor,
  oauthMethod,
  oauthTarget,
  parseVerificationDescriptor,
  validateClaimLifetime,
} from "@ens-social-verification/protocol";
import { OAuthError, VerificationError } from "@ens-social-verification/protocol/errors";
import { OAuthAttemptId, OAuthEnvelope } from "@ens-social-verification/protocol/schema";

import { Auth } from "../auth/index.js";
import { validateRecordAuthority } from "../verification/claim.js";
import { VerificationClient } from "../verification/client.js";
import { readVerificationRecords } from "../verification/records.js";
import { verifyAuthoritySignature } from "../verification/signature.js";
import {
  assertVerificationSnapshot,
  createVerificationSnapshot,
} from "../verification/snapshot.js";
import { OAuthAttestor, verifyOAuthAttestation } from "./attestor.js";
import { OAuthAuthority } from "./authority.js";
import { OAuthConfig } from "./config.js";
import { OAuthConnection } from "./connection.js";
import { oauthProvider } from "./providers.js";

const make = Effect.gen(function* () {
  const attestations = yield* OAuthAttestationRepository;
  const connection = yield* OAuthConnection;
  const authority = yield* OAuthAuthority;
  const config = yield* OAuthConfig;
  const attestor = yield* OAuthAttestor;
  const sdk = yield* VerificationClient;
  const auth = yield* Auth;
  const prefix = `${config.proofOrigin}/verification/oauth/proofs/`;
  const proofId = Effect.fn("OAuthProofs.proofId")(function* (uri: string) {
    if (!uri.startsWith(prefix))
      return yield* new OAuthError({
        code: "INVALID_PROOF",
        message: "Unsupported OAuth proof origin.",
      });
    return yield* Schema.decodeUnknownEffect(OAuthAttemptId)(uri.slice(prefix.length)).pipe(
      Effect.mapError(
        () => new OAuthError({ code: "INVALID_PROOF", message: "Invalid OAuth proof URL." }),
      ),
    );
  });
  const publication = Effect.fn("OAuthProofs.publication")(function* (
    id: string,
    envelope: OAuthEnvelope,
  ) {
    const proofUri = `${prefix}${id}`;
    return {
      id,
      name: envelope.claim.name,
      provider: envelope.proof.identity.provider,
      value: envelope.proof.identity.value,
      recordKey: envelope.claim.recordKey,
      proofUri,
      descriptor: yield* formatVerificationDescriptor({
        authorityVersion: 2,
        method: oauthMethod,
        proofUri,
      }),
    };
  });
  const proof = Effect.fn("OAuthProofs.proof")(function* (id: string) {
    const stored = yield* attestations.find(id);
    if (!stored || stored.revokedAt)
      return yield* new OAuthError({
        code: "INVALID_PROOF",
        message: "OAuth proof is missing or revoked.",
      });
    return stored.envelope;
  });
  return {
    proof,
    attempt: Effect.fn("OAuthProofs.attempt")(function* (id: string, token: string | undefined) {
      const pending = yield* connection.attempt(id, token);
      const stored = yield* attestations.find(id);
      return {
        id,
        name: pending.name,
        provider: pending.provider,
        status: pending.status,
        identity: pending.identity,
        claim: pending.claim,
        expiresAt: pending.expiresAt.toISOString(),
        publication: stored && !stored.revokedAt ? yield* publication(id, stored.envelope) : null,
      };
    }),
    publish: Effect.fn("OAuthProofs.publish")(
      function* (id: string, signature: string, token: string | undefined) {
        const pending = yield* connection.attempt(id, token);
        if (!pending.claim || !pending.identity || !attestor.address)
          return yield* new OAuthError({
            code: "INVALID_ATTEMPT",
            message: "Complete OAuth authorization before publishing.",
          });
        const owner = yield* authority.check(pending.name, pending.walletAddress);
        yield* validateClaimLifetime(
          pending.claim,
          BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000)),
          owner.authorityValidUntil,
        );
        yield* verifyAuthoritySignature(pending.claim, signature, owner.authority, owner.snapshot);
        const proofUri = `${prefix}${id}`;
        const envelope = yield* Schema.decodeUnknownEffect(OAuthEnvelope)({
          v: "ensrv1",
          claim: pending.claim,
          authoritySignature: signature,
          proof: {
            attemptId: id,
            identity: pending.identity,
            attestor: attestor.address,
            signature: yield* attestor.sign(pending.claim, proofUri),
          },
        });
        yield* verifyOAuthAttestation(envelope, proofUri, attestor.address);
        yield* connection.attempt(id, token);
        return yield* publication(
          id,
          yield* attestations.publish(id, pending.sessionHash, envelope),
        );
      },
      Effect.provideService(VerificationClient, sdk),
    ),
    remove: Effect.fn("OAuthProofs.remove")(function* (
      providerId: string,
      name: string,
      uri: string,
      token: string | undefined,
    ) {
      const provider = yield* oauthProvider(providerId);
      const session = yield* auth.session(token);
      const owner = yield* authority.check(name, session.address);
      const id = yield* proofId(uri);
      const stored = yield* attestations.find(id);
      if (
        !stored ||
        stored.envelope.claim.name !== owner.name ||
        stored.envelope.proof.identity.provider !== providerId
      )
        return yield* new OAuthError({
          code: "FORBIDDEN",
          message: "This attestation belongs to another name or provider.",
        });
      const records = yield* sdk.records.getTexts
        .effect({
          name: owner.name,
          keys: [provider.recordKey, `verification[text][${provider.recordKey}]`],
          blockNumber: owner.snapshot.number,
        })
        .pipe(
          Effect.mapError(
            () =>
              new OAuthError({
                code: "UNAVAILABLE",
                message: "Cannot confirm record removal. Retry revocation shortly.",
              }),
          ),
        );
      yield* assertVerificationSnapshot(owner.snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
      );
      if (records.length !== 2 || records.some((record) => record.value))
        return yield* new OAuthError({
          code: "INVALID_ATTEMPT",
          message: "Clear both records before revoking the attestation.",
        });
      yield* attestations.revoke(id);
      return { revoked: true as const };
    }),
    status: Effect.fn("OAuthProofs.status")(
      function* (providerId: string, name: string) {
        const provider = yield* oauthProvider(providerId);
        const snapshot = yield* createVerificationSnapshot();
        const records = yield* readVerificationRecords(name, provider.recordKey, snapshot);
        const descriptor = yield* parseVerificationDescriptor(records.descriptor);
        if (descriptor.method !== oauthMethod || !descriptor.proofUri)
          return yield* new OAuthError({
            code: "INVALID_PROOF",
            message: "No OAuth attestation is linked.",
          });
        const id = yield* proofId(descriptor.proofUri);
        const envelope = yield* proof(id);
        if (!attestor.address)
          return yield* new OAuthError({
            code: "UNAVAILABLE",
            message: "No trusted OAuth attestor configured.",
          });
        yield* verifyOAuthAttestation(envelope, descriptor.proofUri, attestor.address);
        if (envelope.proof.attemptId !== id || envelope.proof.identity.provider !== providerId)
          return yield* new OAuthError({
            code: "INVALID_PROOF",
            message: "OAuth proof belongs to another provider.",
          });
        const verified = yield* validateRecordAuthority({
          name,
          recordKey: provider.recordKey,
          envelope,
          method: oauthMethod,
          uriPolicy: "required",
          deriveTarget: (value) =>
            value === envelope.proof.identity.value
              ? Effect.succeed(oauthTarget(envelope.proof.identity, id))
              : Effect.fail(
                  new VerificationError({
                    code: "RECORD_MISMATCH",
                    message: "Record does not match the attested account.",
                  }),
                ),
        });
        if (verified.descriptor.proofUri !== descriptor.proofUri)
          return yield* new OAuthError({
            code: "INVALID_PROOF",
            message: "Proof changed during verification.",
          });
        // Recheck revocation after chain reads so a removed proof cannot use an earlier database result.
        yield* proof(id);
        return {
          status: "verified" as const,
          value: envelope.proof.identity.value,
          proofUri: descriptor.proofUri,
          validUntil: String(verified.validUntil),
          attestor: attestor.address,
          reason: null,
        };
      },
      Effect.provideService(VerificationClient, sdk),
      Effect.catch((error) => {
        if (
          (Schema.is(OAuthError)(error) && error.code !== "UNAVAILABLE") ||
          (Schema.is(VerificationError)(error) &&
            error.code !== "DEPENDENCY_UNAVAILABLE" &&
            error.code !== "STALE_SNAPSHOT")
        )
          return Effect.succeed({
            status: "unverified" as const,
            value: null,
            proofUri: null,
            validUntil: null,
            attestor: null,
            reason: error.message,
          });
        return Effect.fail(error);
      }),
    ),
  };
});

export class OAuthProofs extends Context.Service<OAuthProofs, Effect.Success<typeof make>>()(
  "application/OAuthProofs",
) {
  static readonly layer = Layer.effect(OAuthProofs, make);
}
