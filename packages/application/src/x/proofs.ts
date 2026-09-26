import { Clock, Context, Effect, Layer, Schema } from "effect";

import { XAttemptRepository, XPublicationRepository } from "@ens-social-verification/database";
import {
  formatVerificationDescriptor,
  parseVerificationDescriptor,
  validateClaimLifetime,
  xMethod,
  xProofPost,
  xRecordKey,
} from "@ens-social-verification/protocol";
import { XError, VerificationError } from "@ens-social-verification/protocol/errors";
import type { XPublication } from "@ens-social-verification/protocol/model";
import { XAttemptId, XEnvelope } from "@ens-social-verification/protocol/schema";

import { validateRecordAuthority } from "../verification/claim.js";
import { VerificationClient } from "../verification/client.js";
import { readVerificationRecords } from "../verification/records.js";
import { verifyAuthoritySignature } from "../verification/signature.js";
import { createVerificationSnapshot } from "../verification/snapshot.js";
import { XAuthority } from "./authority.js";
import { XConfig } from "./config.js";
import { XOAuth } from "./oauth.js";
import { XProvider } from "./provider.js";
import { XTokens } from "./token.js";

const make = Effect.gen(function* () {
  const oauth = yield* XOAuth;
  const authority = yield* XAuthority;
  const attempts = yield* XAttemptRepository;
  const publications = yield* XPublicationRepository;
  const provider = yield* XProvider;
  const tokens = yield* XTokens;
  const config = yield* XConfig;
  const client = yield* VerificationClient;

  const publication = Effect.fn("XProofs.publication")(function* (stored: XPublication) {
    const proofUri = `${config.proofOrigin}/verification/x/proofs/${stored.id}`;
    const descriptor = yield* formatVerificationDescriptor({
      authorityVersion: 2,
      method: xMethod,
      proofUri,
    });
    return {
      id: stored.id,
      name: stored.name,
      login: stored.login,
      descriptor,
      proofUri,
      postUri: `https://x.com/i/status/${stored.postId}`,
    };
  });
  const locate = Effect.fn("XProofs.locate")(function* (proofUri: string) {
    const prefix = `${config.proofOrigin}/verification/x/proofs/`;
    if (!proofUri.startsWith(prefix))
      return yield* new XError({ code: "INVALID_PROOF", message: "Unsupported X proof origin." });
    const id = yield* Schema.decodeUnknownEffect(XAttemptId)(proofUri.slice(prefix.length)).pipe(
      Effect.mapError(() => new XError({ code: "INVALID_PROOF", message: "Invalid X proof URL." })),
    );
    const stored = yield* publications.find(id);
    if (!stored)
      return yield* new XError({ code: "INVALID_PROOF", message: "X proof was not found." });
    return stored;
  });
  const verifyPost = Effect.fn("XProofs.verifyPost")(function* (envelope: XEnvelope) {
    const post = yield* provider.readPost(envelope.proof.postId);
    if (
      post.id !== envelope.proof.postId ||
      post.author_id !== envelope.proof.xId ||
      post.text !== xProofPost(envelope.claim) ||
      post.editHistoryIds.length !== 1 ||
      post.editHistoryIds[0] !== post.id
    )
      return yield* new XError({
        code: "INVALID_PROOF",
        message: "X post author, contents, or edit history no longer matches the proof.",
      });
    const identity = yield* provider.lookup(envelope.proof.xId);
    if (
      identity.id !== envelope.proof.xId ||
      identity.login !== envelope.proof.login ||
      envelope.claim.target !== `x:user:${identity.id}:proof:${envelope.proof.attemptId}`
    )
      return yield* new XError({
        code: "INVALID_PROOF",
        message: "The X account was renamed, reassigned, or does not match the signed claim.",
      });
    return identity;
  });

  return {
    locate,
    verifyPost,
    proof: Effect.fn("XProofs.proof")(function* (id: string) {
      const stored = yield* publications.find(id);
      if (!stored)
        return yield* new XError({ code: "INVALID_PROOF", message: "X proof was not found." });
      return stored.envelope;
    }),
    published: Effect.fn("XProofs.published")(function* (id: string, token: string | undefined) {
      yield* oauth.attempt(id, token);
      const stored = yield* publications.find(id);
      return stored ? yield* publication(stored) : null;
    }),
    finalize: Effect.fn("XProofs.finalize")(
      function* (id: string, signature: string, token: string | undefined) {
        const attempt = yield* oauth.attempt(id, token);
        const existing = yield* publications.find(id);
        if (existing) return yield* publication(existing);
        if (
          !attempt.claim ||
          !attempt.identity ||
          !attempt.encryptedToken ||
          attempt.status !== "ready"
        )
          return yield* new XError({
            code: "INVALID_ATTEMPT",
            message: "Publication is unavailable. Check your X posts before connecting again.",
          });
        const owner = yield* authority.check(attempt.name, attempt.walletAddress);
        const now = yield* Clock.currentTimeMillis;
        yield* validateClaimLifetime(
          attempt.claim,
          BigInt(Math.floor(now / 1000)),
          owner.authorityValidUntil,
        );
        yield* verifyAuthoritySignature(attempt.claim, signature, owner.authority, owner.snapshot);
        const credential = yield* tokens.decrypt(id, attempt.encryptedToken);
        const identity = yield* provider.currentUser(credential);
        if (identity.id !== attempt.identity.id || identity.login !== attempt.identity.login)
          return yield* new XError({
            code: "INVALID_ATTEMPT",
            message: "X account changed. Connect again.",
          });
        yield* oauth.attempt(id, token);
        // Reserve before posting: a timeout after submission must never trigger an automatic duplicate post.
        yield* attempts.claimPublication(id);
        const postId = yield* provider.createPost(credential, xProofPost(attempt.claim));
        const envelope = yield* Schema.decodeUnknownEffect(XEnvelope)({
          v: "ensrv1",
          claim: attempt.claim,
          authoritySignature: signature,
          proof: { xId: identity.id, login: identity.login, attemptId: id, postId },
        });
        const stored = {
          id,
          name: attempt.name,
          login: identity.login,
          postId,
          envelope,
          createdAt: new Date(now),
        };
        yield* publications.create(stored);
        return yield* publication(stored);
      },
      Effect.provideService(VerificationClient, client),
    ),
    status: Effect.fn("XProofs.status")(
      function* (name: string) {
        const snapshot = yield* createVerificationSnapshot();
        const records = yield* readVerificationRecords(name, xRecordKey, snapshot);
        const descriptor = yield* parseVerificationDescriptor(records.descriptor);
        if (descriptor.method !== xMethod || !descriptor.proofUri)
          return yield* new XError({
            code: "INVALID_PROOF",
            message: "No X proof post is linked.",
          });
        const stored = yield* locate(descriptor.proofUri);
        const envelope = stored.envelope;
        const identity = yield* verifyPost(envelope);
        const verified = yield* validateRecordAuthority({
          name,
          recordKey: xRecordKey,
          envelope,
          method: xMethod,
          uriPolicy: "required",
          deriveTarget: (value) =>
            value === identity.login
              ? Effect.succeed(`x:user:${identity.id}:proof:${envelope.proof.attemptId}`)
              : Effect.fail(
                  new VerificationError({ code: "RECORD_MISMATCH", message: "Invalid X record" }),
                ),
        });
        if (
          verified.descriptor.proofUri !== descriptor.proofUri ||
          verified.records.value !== envelope.proof.login ||
          stored.name !== name ||
          stored.id !== envelope.proof.attemptId
        )
          return yield* new XError({
            code: "INVALID_PROOF",
            message: "X proof does not match the live ENS records.",
          });
        const owner = yield* authority.check(name, envelope.claim.authority);
        yield* validateClaimLifetime(
          envelope.claim,
          BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000)),
          owner.authorityValidUntil,
        );
        return {
          status: "verified" as const,
          login: identity.login,
          reason: null,
          proofUri: descriptor.proofUri,
          validUntil: envelope.claim.validUntil,
        };
      },
      Effect.provideService(VerificationClient, client),
      Effect.catch((error) => {
        if (
          (Schema.is(VerificationError)(error) &&
            error.code !== "DEPENDENCY_UNAVAILABLE" &&
            error.code !== "STALE_SNAPSHOT") ||
          (Schema.is(XError)(error) && error.code !== "UNAVAILABLE")
        )
          return Effect.succeed({
            status: "unverified" as const,
            login: null,
            reason: error.message,
            proofUri: null,
            validUntil: null,
          });
        return Effect.fail(error);
      }),
    ),
  };
});

export class XProofs extends Context.Service<XProofs, Effect.Success<typeof make>>()(
  "application/XProofs",
) {
  static readonly layer = Layer.effect(XProofs, make);
}
