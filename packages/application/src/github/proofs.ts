import { Clock, Context, Effect, Layer, Schema } from "effect";

import {
  GithubAttemptRepository,
  GithubPublicationRepository,
} from "@ens-social-verification/database";
import {
  decodeGithubEnvelope,
  formatVerificationDescriptor,
  githubMethod,
  githubProofFilename,
  githubRecordKey,
  parseGithubGistUri,
  parseVerificationDescriptor,
  serializeGithubEnvelope,
  validateClaimLifetime,
} from "@ens-social-verification/protocol";
import { GithubError, VerificationError } from "@ens-social-verification/protocol/errors";
import type { GithubPublication } from "@ens-social-verification/protocol/model";
import { GithubEnvelope } from "@ens-social-verification/protocol/schema";

import { validateRecordAuthority } from "../verification/claim.js";
import { VerificationClient } from "../verification/client.js";
import { readVerificationRecords } from "../verification/records.js";
import { verifyAuthoritySignature } from "../verification/signature.js";
import { createVerificationSnapshot } from "../verification/snapshot.js";
import { GithubAuthority } from "./authority.js";
import { GithubOAuth } from "./oauth.js";
import { GithubProvider } from "./provider.js";
import { GithubTokens } from "./token.js";

const make = Effect.gen(function* () {
  const oauth = yield* GithubOAuth;
  const authority = yield* GithubAuthority;
  const attempts = yield* GithubAttemptRepository;
  const publications = yield* GithubPublicationRepository;
  const provider = yield* GithubProvider;
  const tokens = yield* GithubTokens;
  const client = yield* VerificationClient;

  const publication = Effect.fn("GithubProofs.publication")(function* (stored: GithubPublication) {
    const proofUri = `https://gist.github.com/${stored.login}/${stored.gistId}`;
    const descriptor = yield* formatVerificationDescriptor({
      authorityVersion: 2,
      method: githubMethod,
      proofUri,
    });
    return { id: stored.id, name: stored.name, login: stored.login, descriptor, proofUri };
  });

  return {
    published: Effect.fn("GithubProofs.published")(function* (
      id: string,
      token: string | undefined,
    ) {
      yield* oauth.attempt(id, token);
      const stored = yield* publications.find(id);
      return stored ? yield* publication(stored) : null;
    }),
    finalize: Effect.fn("GithubProofs.finalize")(
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
          return yield* new GithubError({
            code: "INVALID_ATTEMPT",
            message: "Publication is unavailable. Check your gists, then connect GitHub again.",
          });
        const owner = yield* authority.check(attempt.name, attempt.walletAddress);
        const now = yield* Clock.currentTimeMillis;
        yield* validateClaimLifetime(
          attempt.claim,
          BigInt(Math.floor(now / 1000)),
          owner.authorityValidUntil,
        );
        yield* verifyAuthoritySignature(attempt.claim, signature, owner.authority, owner.snapshot);
        const githubToken = yield* tokens.decrypt(id, attempt.encryptedToken);
        const identity = yield* provider.currentUser(githubToken);
        if (identity.id !== attempt.identity.id || identity.login !== attempt.identity.login)
          return yield* new GithubError({
            code: "INVALID_ATTEMPT",
            message: "GitHub account changed. Connect again before signing.",
          });
        const envelope = yield* Schema.decodeUnknownEffect(GithubEnvelope)({
          v: "ensrv1",
          claim: attempt.claim,
          authoritySignature: signature,
          proof: { githubId: identity.id, login: identity.login },
        });
        yield* oauth.attempt(id, token);
        // Consume once before the remote write. Never retry a potentially successful gist creation.
        yield* attempts.claimPublication(id);
        const gist = yield* provider.createGist(githubToken, envelope);
        if (
          String(gist.owner.id) !== identity.id ||
          gist.owner.login.toLowerCase() !== identity.login ||
          gist.truncated ||
          gist.fork_of ||
          gist.files[githubProofFilename]?.content !== serializeGithubEnvelope(envelope)
        ) {
          return yield* new GithubError({
            code: "INVALID_PROOF",
            message: "Published gist did not match the signed proof",
          });
        }
        const stored = {
          id,
          name: attempt.name,
          login: identity.login,
          gistId: gist.id,
          createdAt: new Date(now),
        };
        yield* publications.create(stored);
        return yield* publication(stored);
      },
      Effect.provideService(VerificationClient, client),
    ),

    status: Effect.fn("GithubProofs.status")(
      function* (name: string) {
        const snapshot = yield* createVerificationSnapshot();
        const records = yield* readVerificationRecords(name, githubRecordKey, snapshot);
        const descriptor = yield* parseVerificationDescriptor(records.descriptor);
        if (descriptor.method !== githubMethod || !descriptor.proofUri)
          return yield* new GithubError({
            code: "INVALID_PROOF",
            message: "No signed GitHub gist is linked",
          });
        const location = yield* parseGithubGistUri(descriptor.proofUri);
        const gist = yield* provider.readGist(location.id);
        const file = gist.files[githubProofFilename];
        if (
          gist.id !== location.id ||
          gist.truncated ||
          gist.fork_of ||
          !file ||
          file.truncated ||
          file.size > 64 * 1024 ||
          file.filename !== githubProofFilename
        )
          return yield* new GithubError({
            code: "INVALID_PROOF",
            message: "The gist has no complete verification proof",
          });
        const envelope = yield* decodeGithubEnvelope(file.content);
        if (
          gist.owner.login.toLowerCase() !== location.login ||
          location.login !== envelope.proof.login ||
          String(gist.owner.id) !== envelope.proof.githubId
        )
          return yield* new GithubError({
            code: "INVALID_PROOF",
            message: "Gist ownership does not match the signed GitHub account",
          });
        const identity = yield* provider.lookup(envelope.proof.login);
        if (identity.id !== envelope.proof.githubId || identity.login !== envelope.proof.login)
          return yield* new GithubError({
            code: "INVALID_PROOF",
            message: "GitHub account was renamed or reassigned",
          });
        const verified = yield* validateRecordAuthority({
          name,
          recordKey: githubRecordKey,
          envelope,
          method: githubMethod,
          uriPolicy: "required",
          deriveTarget: (value) =>
            value === identity.login
              ? Effect.succeed(`github:user:${identity.id}`)
              : Effect.fail(
                  new VerificationError({
                    code: "RECORD_MISMATCH",
                    message: "Invalid GitHub record",
                  }),
                ),
        });
        if (
          verified.descriptor.proofUri !== descriptor.proofUri ||
          envelope.proof.login !== verified.records.value ||
          envelope.claim.target !== `github:user:${envelope.proof.githubId}`
        )
          return yield* new GithubError({
            code: "INVALID_PROOF",
            message: "The gist does not match the live GitHub record",
          });
        const finalOwner = yield* authority.check(name, envelope.claim.authority);
        yield* validateClaimLifetime(
          envelope.claim,
          BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000)),
          finalOwner.authorityValidUntil,
        );
        return {
          status: "verified" as const,
          login: envelope.proof.login,
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
          (Schema.is(GithubError)(error) && error.code !== "UNAVAILABLE")
        ) {
          return Effect.succeed({
            status: "unverified" as const,
            login: null,
            reason: error.message,
            proofUri: null,
            validUntil: null,
          });
        }
        return Effect.fail(error);
      }),
    ),
  };
});

export class GithubProofs extends Context.Service<GithubProofs, Effect.Success<typeof make>>()(
  "application/GithubProofs",
) {
  static readonly layer = Layer.effect(GithubProofs, make);
}
