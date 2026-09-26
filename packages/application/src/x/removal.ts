import { Context, Effect, Layer } from "effect";

import { XAttemptRepository } from "@ens-social-verification/database";
import { XError } from "@ens-social-verification/protocol/errors";

import { Auth } from "../auth/index.js";
import { VerificationClient } from "../verification/client.js";
import { assertVerificationSnapshot } from "../verification/snapshot.js";
import { XAuthority } from "./authority.js";
import { XOAuth } from "./oauth.js";
import { XProofs } from "./proofs.js";
import { XProvider } from "./provider.js";
import { XTokens } from "./token.js";

const make = Effect.gen(function* () {
  const auth = yield* Auth;
  const authority = yield* XAuthority;
  const oauth = yield* XOAuth;
  const proofs = yield* XProofs;
  const attempts = yield* XAttemptRepository;
  const tokens = yield* XTokens;
  const provider = yield* XProvider;
  const sdk = yield* VerificationClient;
  const access = Effect.fn("XRemoval.access")(function* (
    name: string,
    proofUri: string,
    sessionToken: string | undefined,
  ) {
    const session = yield* auth.session(sessionToken);
    const owner = yield* authority.check(name, session.address);
    const stored = yield* proofs.locate(proofUri);
    if (stored.name !== owner.name)
      return yield* new XError({
        code: "INVALID_ATTEMPT",
        message: "This proof belongs to another ENS name.",
      });
    const attempt = yield* oauth
      .attempt(stored.id, sessionToken)
      .pipe(
        Effect.catchTag("XError", (error) =>
          error.code === "INVALID_ATTEMPT" ? Effect.succeed(null) : Effect.fail(error),
        ),
      );
    return { owner, stored, attempt };
  });
  return {
    options: Effect.fn("XRemoval.options")(function* (
      name: string,
      proofUri: string,
      token: string | undefined,
    ) {
      const { attempt } = yield* access(name, proofUri, token);
      return { canDeletePost: Boolean(attempt?.encryptedToken && attempt.identity) };
    }),
    deletePost: Effect.fn("XRemoval.deletePost")(function* (
      name: string,
      proofUri: string,
      token: string | undefined,
    ) {
      const { owner, attempt, stored } = yield* access(name, proofUri, token);
      const records = yield* sdk.records.getTexts
        .effect({
          name: owner.name,
          keys: ["com.twitter", "verification[text][com.twitter]"],
          blockNumber: owner.snapshot.number,
        })
        .pipe(
          Effect.mapError(
            () =>
              new XError({
                code: "UNAVAILABLE",
                message: "Cannot confirm record removal. The X post was not deleted.",
              }),
          ),
        );
      yield* assertVerificationSnapshot(owner.snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
      );
      if (records.length !== 2 || records.some((record) => record.value))
        return yield* new XError({
          code: "INVALID_ATTEMPT",
          message: "Clear both X records before deleting the post.",
        });
      if (!attempt?.encryptedToken || !attempt.identity)
        return {
          deleted: false,
          message: "ENS records removed. X access expired; the post was kept.",
        };
      const credential = yield* tokens.decrypt(attempt.id, attempt.encryptedToken);
      const identity = yield* provider.currentUser(credential);
      const proofIdentity = yield* proofs.verifyPost(stored.envelope);
      if (identity.id !== attempt.identity.id || identity.id !== proofIdentity.id)
        return yield* new XError({
          code: "INVALID_ATTEMPT",
          message: "X ownership changed. The post was kept.",
        });
      yield* oauth.attempt(attempt.id, token);
      yield* provider.deletePost(stored.postId, credential);
      yield* attempts.clearToken(attempt.id);
      return { deleted: true, message: "Both ENS records and the X proof post were removed." };
    }),
  };
});
export class XRemoval extends Context.Service<XRemoval, Effect.Success<typeof make>>()(
  "application/XRemoval",
) {
  static readonly layer = Layer.effect(XRemoval, make);
}
