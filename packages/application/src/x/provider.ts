import { Context, Effect, Layer, Redacted, Schema } from "effect";

import { XError } from "@ens-social-verification/protocol/errors";
import { XId, XPostId, type XIdentity } from "@ens-social-verification/protocol/schema";

import { XConfig } from "./config.js";
import { requestJson } from "./request.js";

const userSchema = Schema.Struct({
  data: Schema.Struct({
    id: XId,
    username: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_]{1,15}$/)),
    protected: Schema.Boolean,
  }),
});
const postSchema = Schema.Struct({
  data: Schema.Struct({
    id: XPostId,
    author_id: XId,
    text: Schema.String,
    edit_history_tweet_ids: Schema.optional(Schema.Array(XPostId)),
    edit_history_post_ids: Schema.optional(Schema.Array(XPostId)),
  }),
});
type Post = {
  readonly id: string;
  readonly author_id: string;
  readonly text: string;
  readonly editHistoryIds: readonly string[];
};

export class XProvider extends Context.Service<
  XProvider,
  {
    readonly exchange: (
      code: string,
      verifier: string,
    ) => Effect.Effect<
      { identity: typeof XIdentity.Type; token: Redacted.Redacted<string> },
      XError
    >;
    readonly currentUser: (
      token: Redacted.Redacted<string>,
    ) => Effect.Effect<typeof XIdentity.Type, XError>;
    readonly lookup: (id: string) => Effect.Effect<typeof XIdentity.Type, XError>;
    readonly createPost: (
      token: Redacted.Redacted<string>,
      text: string,
    ) => Effect.Effect<string, XError>;
    readonly readPost: (id: string) => Effect.Effect<Post, XError>;
    readonly deletePost: (
      id: string,
      token: Redacted.Redacted<string>,
    ) => Effect.Effect<void, XError>;
  }
>()("application/XProvider") {
  static readonly layer = Layer.effect(
    XProvider,
    Effect.gen(function* () {
      const config = yield* XConfig;
      const readUser = Effect.fn("XProvider.readUser")(function* (
        path: string,
        token: Redacted.Redacted<string>,
      ) {
        const response = yield* requestJson(
          `https://api.x.com/2/users/${path}?user.fields=protected`,
          {
            headers: { authorization: `Bearer ${Redacted.value(token)}` },
          },
        );
        const { data } = yield* Schema.decodeUnknownEffect(userSchema)(response).pipe(
          Effect.mapError(
            () =>
              new XError({
                code: "INVALID_PROOF",
                message: "X identity is unavailable or incomplete.",
              }),
          ),
        );
        if (data.protected)
          return yield* new XError({
            code: "INVALID_PROOF",
            message: "A public X account is required for public verification.",
          });
        return { id: data.id, login: data.username.toLowerCase() };
      });
      const currentUser = (token: Redacted.Redacted<string>) => readUser("me", token);
      return {
        currentUser,
        lookup: (id) => readUser(encodeURIComponent(id), config.apiToken),
        exchange: Effect.fn("XProvider.exchange")(function* (code, verifier) {
          const response = yield* requestJson("https://api.x.com/2/oauth2/token", {
            method: "POST",
            headers: {
              authorization: `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(Redacted.value(config.clientSecret))}`).toString("base64")}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: config.redirectUri,
              code_verifier: verifier,
            }).toString(),
          });
          const credential = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              access_token: Schema.String.check(Schema.isMinLength(1)),
              token_type: Schema.String,
              scope: Schema.String,
              expires_in: Schema.Number,
            }),
          )(response).pipe(
            Effect.mapError(
              () =>
                new XError({
                  code: "INVALID_ATTEMPT",
                  message: "X authorization failed. Connect again.",
                }),
            ),
          );
          if (
            credential.token_type.toLowerCase() !== "bearer" ||
            credential.expires_in < 900 ||
            !["users.read", "tweet.read", "tweet.write"].every((scope) =>
              credential.scope.split(" ").includes(scope),
            )
          )
            return yield* new XError({
              code: "INVALID_ATTEMPT",
              message: "X read and post permissions are required.",
            });
          const token = Redacted.make(credential.access_token);
          return { identity: yield* currentUser(token), token };
        }),
        createPost: Effect.fn("XProvider.createPost")(function* (token, text) {
          const response = yield* requestJson("https://api.x.com/2/tweets", {
            method: "POST",
            headers: {
              authorization: `Bearer ${Redacted.value(token)}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ text }),
          });
          const { data } = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              data: Schema.Struct({ id: XPostId, text: Schema.String }),
            }),
          )(response).pipe(
            Effect.mapError(
              () =>
                new XError({
                  code: "UNAVAILABLE",
                  message:
                    "X returned an incomplete publication. Check your posts before reconnecting.",
                }),
            ),
          );
          if (data.text !== text)
            return yield* new XError({
              code: "INVALID_PROOF",
              message: "X changed the proof post. Check your posts before reconnecting.",
            });
          return data.id;
        }),
        readPost: Effect.fn("XProvider.readPost")(function* (id) {
          const response = yield* requestJson(
            `https://api.x.com/2/tweets/${encodeURIComponent(id)}?expansions=author_id`,
            {
              headers: { authorization: `Bearer ${Redacted.value(config.apiToken)}` },
            },
          );
          const { data } = yield* Schema.decodeUnknownEffect(postSchema)(response).pipe(
            Effect.mapError(
              () =>
                new XError({
                  code: "INVALID_PROOF",
                  message: "The public X proof post is missing or incomplete.",
                }),
            ),
          );
          // X uses both post and legacy tweet terminology; edit history is a default response field.
          const history = data.edit_history_post_ids ?? data.edit_history_tweet_ids;
          if (
            !history ||
            (data.edit_history_post_ids &&
              data.edit_history_tweet_ids &&
              JSON.stringify(data.edit_history_post_ids) !==
                JSON.stringify(data.edit_history_tweet_ids))
          )
            return yield* new XError({
              code: "INVALID_PROOF",
              message: "X post edit history is missing or ambiguous.",
            });
          return {
            id: data.id,
            author_id: data.author_id,
            text: data.text,
            editHistoryIds: history,
          };
        }),
        deletePost: Effect.fn("XProvider.deletePost")(function* (id, token) {
          const response = yield* requestJson(
            `https://api.x.com/2/tweets/${encodeURIComponent(id)}`,
            {
              method: "DELETE",
              headers: { authorization: `Bearer ${Redacted.value(token)}` },
            },
          );
          yield* Schema.decodeUnknownEffect(
            Schema.Struct({ data: Schema.Struct({ deleted: Schema.Literal(true) }) }),
          )(response).pipe(
            Effect.mapError(
              () =>
                new XError({
                  code: "UNAVAILABLE",
                  message: "X did not confirm post deletion. Check the post manually.",
                }),
            ),
          );
        }),
      };
    }),
  );
}
