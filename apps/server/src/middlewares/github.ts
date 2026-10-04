import { Clock, Context, Effect, Layer, Schema } from "effect";
import { type HttpServerRequest, HttpServerResponse } from "effect/http";

import { AuthConfig } from "@ens-social-verification/application";
import {
  GithubError,
  Unauthenticated,
  VerificationError,
} from "@ens-social-verification/protocol/errors";

import { AuthHttpError } from "../helpers/auth-body.js";

const make = Effect.gen(function* () {
  const config = yield* AuthConfig;
  let windowStart = 0;
  let requests = 0;
  let active = 0;
  return {
    wrap:
      <R>(
        operation: (
          request: HttpServerRequest.HttpServerRequest,
        ) => Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, R>,
        callback = false,
      ) =>
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (
            !callback &&
            ((request.method !== "GET" && request.headers.origin !== config.origin) ||
              (request.headers.origin && request.headers.origin !== config.origin))
          ) {
            return HttpServerResponse.jsonUnsafe(
              { error: "Untrusted request origin" },
              { status: 403 },
            );
          }
          const now = yield* Clock.currentTimeMillis;
          if (now - windowStart >= 60_000) {
            windowStart = now;
            requests = 0;
          }
          if (requests >= 60 || active >= 5)
            return HttpServerResponse.jsonUnsafe(
              { error: "GitHub verification request limit reached" },
              { status: 429, headers: { "retry-after": "60" } },
            );
          requests++;
          active++;
          return yield* operation(request).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                active--;
              }),
            ),
          );
        }).pipe(
          Effect.catch((error) => {
            let status = 503;
            let message = "GitHub verification temporarily unavailable";
            if (Schema.is(Unauthenticated)(error)) {
              status = 401;
              message = "Sign in with your wallet first";
            } else if (Schema.is(AuthHttpError)(error)) {
              status = error.status;
              message = error.message;
            } else if (Schema.is(GithubError)(error)) {
              status = error.code === "UNAVAILABLE" ? 503 : error.code === "FORBIDDEN" ? 403 : 400;
              message = error.message;
            } else if (Schema.is(VerificationError)(error)) {
              status =
                error.code === "DEPENDENCY_UNAVAILABLE" || error.code === "STALE_SNAPSHOT"
                  ? 503
                  : 400;
              message = error.message;
            }
            return Effect.succeed(HttpServerResponse.jsonUnsafe({ error: message }, { status }));
          }),
          Effect.map((response) =>
            response.pipe(
              HttpServerResponse.setHeaders({
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
                "referrer-policy": "no-referrer",
              }),
            ),
          ),
        ),
  };
});

export class GithubMiddleware extends Context.Service<
  GithubMiddleware,
  Effect.Success<typeof make>
>()("server/GithubMiddleware") {
  static readonly layer = Layer.effect(GithubMiddleware, make);
}
