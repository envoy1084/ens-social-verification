import { Context, Effect, Layer, Redacted, Schema } from "effect";

import { githubProofFilename, serializeGithubEnvelope } from "@ens-social-verification/protocol";
import { GithubError } from "@ens-social-verification/protocol/errors";
import {
  type GithubIdentity,
  GithubLogin,
  GithubGistId,
  type GithubEnvelope,
} from "@ens-social-verification/protocol/schema";

import { GithubConfig } from "./config.js";

const userSchema = Schema.Struct({
  id: Schema.Int.check(
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  ),
  login: GithubLogin,
  type: Schema.Literal("User"),
});
const tokenSchema = Schema.Struct({
  access_token: Schema.String.check(Schema.isMinLength(1)),
  token_type: Schema.Literal("bearer"),
  scope: Schema.String,
});
const gistSchema = Schema.Struct({
  id: GithubGistId,
  public: Schema.Literal(true),
  owner: userSchema,
  truncated: Schema.optional(Schema.Boolean),
  fork_of: Schema.optional(Schema.Unknown),
  files: Schema.Record(
    Schema.String,
    Schema.Struct({
      filename: Schema.String,
      truncated: Schema.Boolean,
      content: Schema.String,
      size: Schema.Number,
    }),
  ),
});
type Gist = typeof gistSchema.Type;

const requestJson = Effect.fn("Github.requestJson")(function* (url: string, init?: RequestInit) {
  return yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        headers: {
          accept: "application/json",
          "user-agent": "ens-social-verification",
          ...init?.headers,
        },
      });
      if (response.status === 404) {
        await response.body?.cancel();
        throw new GithubError({
          code: "INVALID_PROOF",
          message: "GitHub account or gist is no longer public",
        });
      }
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after")))
      ) {
        await response.body?.cancel();
        throw new GithubError({
          code: "UNAVAILABLE",
          message:
            "GitHub's API rate limit was reached. Wait before checking again; no ENS transaction is needed.",
        });
      }
      if (response.status === 204) return undefined;
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("GitHub request failed");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          // eslint-disable-next-line no-await-in-loop -- Bound the response while reading the stream sequentially.
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 128 * 1024) throw new Error("GitHub response too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    },
    catch: (error) =>
      Schema.is(GithubError)(error)
        ? error
        : new GithubError({
            code: "UNAVAILABLE",
            message: "GitHub could not be reached. Please try again.",
          }),
  });
});

export class GithubProvider extends Context.Service<
  GithubProvider,
  {
    readonly exchange: (
      code: string,
      verifier: string,
    ) => Effect.Effect<
      { identity: typeof GithubIdentity.Type; token: Redacted.Redacted<string> },
      GithubError
    >;
    readonly currentUser: (
      token: Redacted.Redacted<string>,
    ) => Effect.Effect<typeof GithubIdentity.Type, GithubError>;
    readonly lookup: (login: string) => Effect.Effect<typeof GithubIdentity.Type, GithubError>;
    readonly createGist: (
      token: Redacted.Redacted<string>,
      envelope: GithubEnvelope,
    ) => Effect.Effect<Gist, GithubError>;
    readonly readGist: (id: string) => Effect.Effect<Gist, GithubError>;
    readonly deleteGist: (
      id: string,
      token: Redacted.Redacted<string>,
    ) => Effect.Effect<void, GithubError>;
  }
>()("application/GithubProvider") {
  static readonly layer = Layer.effect(
    GithubProvider,
    Effect.gen(function* () {
      const config = yield* GithubConfig;
      const publicHeaders = Redacted.value(config.apiToken)
        ? { authorization: `Bearer ${Redacted.value(config.apiToken)}` }
        : config.clientId && Redacted.value(config.clientSecret)
          ? {
              authorization: `Basic ${Buffer.from(`${config.clientId}:${Redacted.value(config.clientSecret)}`).toString("base64")}`,
            }
          : undefined;
      const currentUser = Effect.fn("GithubProvider.currentUser")(function* (
        token: Redacted.Redacted<string>,
      ) {
        const user = yield* requestJson("https://api.github.com/user", {
          headers: { authorization: `Bearer ${Redacted.value(token)}` },
        });
        const identity = yield* Schema.decodeUnknownEffect(userSchema)(user).pipe(
          Effect.mapError(
            () =>
              new GithubError({
                code: "INVALID_ATTEMPT",
                message: "A personal GitHub account is required",
              }),
          ),
        );
        return { id: String(identity.id), login: identity.login.toLowerCase() };
      });
      return {
        currentUser,
        deleteGist: Effect.fn("GithubProvider.deleteGist")(function* (id, token) {
          yield* requestJson(`https://api.github.com/gists/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${Redacted.value(token)}` },
          });
        }),
        exchange: Effect.fn("GithubProvider.exchange")(function* (code, verifier) {
          const response = yield* requestJson("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: config.clientId,
              client_secret: Redacted.value(config.clientSecret),
              code,
              redirect_uri: config.redirectUri,
              code_verifier: verifier,
            }).toString(),
          });
          const token = yield* Schema.decodeUnknownEffect(tokenSchema)(response).pipe(
            Effect.mapError(
              () =>
                new GithubError({
                  code: "INVALID_ATTEMPT",
                  message: "GitHub authorization failed. Connect again.",
                }),
            ),
          );
          if (!token.scope.split(/[ ,]+/).includes("gist"))
            return yield* new GithubError({
              code: "INVALID_ATTEMPT",
              message: "GitHub gist permission is required",
            });
          const credential = Redacted.make(token.access_token);
          return { identity: yield* currentUser(credential), token: credential };
        }),
        lookup: Effect.fn("GithubProvider.lookup")(function* (login) {
          const response = yield* requestJson(
            `https://api.github.com/users/${encodeURIComponent(login)}`,
            publicHeaders ? { headers: publicHeaders } : undefined,
          );
          const identity = yield* Schema.decodeUnknownEffect(userSchema)(response).pipe(
            Effect.mapError(
              () =>
                new GithubError({
                  code: "INVALID_PROOF",
                  message: "GitHub identity no longer matches",
                }),
            ),
          );
          return { id: String(identity.id), login: identity.login.toLowerCase() };
        }),
        createGist: Effect.fn("GithubProvider.createGist")(function* (token, envelope) {
          const response = yield* requestJson("https://api.github.com/gists", {
            method: "POST",
            headers: {
              authorization: `Bearer ${Redacted.value(token)}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              public: true,
              description: `ENSv2 GitHub verification for ${envelope.claim.name}`,
              files: { [githubProofFilename]: { content: serializeGithubEnvelope(envelope) } },
            }),
          });
          return yield* Schema.decodeUnknownEffect(gistSchema)(response).pipe(
            Effect.mapError(
              () =>
                new GithubError({
                  code: "UNAVAILABLE",
                  message: "GitHub returned an invalid gist. Check your gists before reconnecting.",
                }),
            ),
          );
        }),
        readGist: Effect.fn("GithubProvider.readGist")(function* (id) {
          const response = yield* requestJson(
            `https://api.github.com/gists/${encodeURIComponent(id)}`,
            publicHeaders ? { headers: publicHeaders } : undefined,
          );
          return yield* Schema.decodeUnknownEffect(gistSchema)(response).pipe(
            Effect.mapError(
              () =>
                new GithubError({
                  code: "INVALID_PROOF",
                  message: "Invalid or incomplete public gist",
                }),
            ),
          );
        }),
      };
    }),
  );
}
