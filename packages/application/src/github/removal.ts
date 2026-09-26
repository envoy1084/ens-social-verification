import { Context, Effect, Layer } from "effect";

import {
  GithubAttemptRepository,
  GithubPublicationRepository,
} from "@ens-social-verification/database";
import {
  decodeGithubEnvelope,
  githubProofFilename,
  parseGithubGistUri,
} from "@ens-social-verification/protocol";
import { GithubError } from "@ens-social-verification/protocol/errors";

import { Auth } from "../auth/index.js";
import { VerificationClient } from "../verification/client.js";
import { assertVerificationSnapshot } from "../verification/snapshot.js";
import { GithubAuthority } from "./authority.js";
import { GithubOAuth } from "./oauth.js";
import { GithubProvider } from "./provider.js";
import { GithubTokens } from "./token.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const authority = yield* GithubAuthority;
  const oauth = yield* GithubOAuth;
  const publications = yield* GithubPublicationRepository;
  const attempts = yield* GithubAttemptRepository;
  const tokens = yield* GithubTokens;
  const provider = yield* GithubProvider;
  const sdk = yield* VerificationClient;

  const access = Effect.fn("GithubRemoval.access")(function* (
    name: string,
    proofUri: string,
    sessionToken: string | undefined,
  ) {
    const session = yield* auth.session(sessionToken);
    const owner = yield* authority.check(name, session.address);
    const location = yield* parseGithubGistUri(proofUri);
    const stored = yield* publications.findByGist(location.id);
    if (!stored || stored.name !== owner.name || stored.login !== location.login)
      return { owner, attempt: null, location };
    const attempt = yield* oauth
      .attempt(stored.id, sessionToken)
      .pipe(
        Effect.catchTag("GithubError", (error) =>
          error.code === "INVALID_ATTEMPT" ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
    return { owner, attempt, location };
  });

  return {
    options: Effect.fn("GithubRemoval.options")(function* (
      name: string,
      proofUri: string,
      sessionToken: string | undefined,
    ) {
      const { attempt } = yield* access(name, proofUri, sessionToken);
      return { canDeleteGist: Boolean(attempt?.encryptedToken && attempt.identity) };
    }),
    deleteGist: Effect.fn("GithubRemoval.deleteGist")(function* (
      name: string,
      proofUri: string,
      sessionToken: string | undefined,
    ) {
      const { owner, attempt, location } = yield* access(name, proofUri, sessionToken);
      const records = yield* sdk.records.getTexts
        .effect({
          name: owner.name,
          keys: ["com.github", "verification[text][com.github]"],
          blockNumber: owner.snapshot.number,
        })
        .pipe(
          Effect.mapError(
            () =>
              new GithubError({
                code: "UNAVAILABLE",
                message: "Cannot confirm ENS record removal. The gist was not deleted.",
              }),
          ),
        );
      yield* assertVerificationSnapshot(owner.snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
      );
      if (records.length !== 2 || records.some((record) => record.value))
        return yield* new GithubError({
          code: "INVALID_ATTEMPT",
          message: "Clear both GitHub ENS records before deleting the gist.",
        });
      if (!attempt?.encryptedToken || !attempt.identity)
        return {
          deleted: false,
          message:
            "ENS records removed. GitHub access expired or is unavailable; delete the gist manually if desired.",
        };
      const credential = yield* tokens.decrypt(attempt.id, attempt.encryptedToken);
      const identity = yield* provider.currentUser(credential);
      const gist = yield* provider.readGist(location.id);
      const file = gist.files[githubProofFilename];
      if (
        identity.id !== attempt.identity.id ||
        String(gist.owner.id) !== identity.id ||
        Object.keys(gist.files).length !== 1 ||
        !file ||
        file.truncated ||
        gist.truncated ||
        gist.fork_of
      )
        return {
          deleted: false,
          message:
            "ENS records removed. The gist's owner or contents changed; it was kept for manual review.",
        };
      const envelope = yield* decodeGithubEnvelope(file.content);
      if (envelope.claim.name !== owner.name || envelope.proof.githubId !== identity.id)
        return {
          deleted: false,
          message:
            "ENS records removed. The gist no longer contains this name's proof, so it was kept.",
        };
      yield* oauth.attempt(attempt.id, sessionToken);
      yield* provider.deleteGist(location.id, credential);
      yield* attempts.clearToken(attempt.id);
      return {
        deleted: true,
        message: "Both ENS records and the signed GitHub gist were removed.",
      };
    }),
  };
});

export class GithubRemoval extends Context.Service<GithubRemoval, Effect.Success<typeof make>>()(
  "application/GithubRemoval",
) {
  static readonly layer = Layer.effect(GithubRemoval, make);
}
