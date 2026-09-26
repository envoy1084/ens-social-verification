import { Clock, Context, Effect, Layer, Schema } from "effect";
import { type HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AuthConfig } from "@ens-social-verification/application";
import {
  InvalidChallenge,
  InvalidSignature,
  Unauthenticated,
} from "@ens-social-verification/protocol/errors";

import { AuthHttpError } from "../helpers/auth-body.js";

const make = Effect.gen(function* () {
  const config = yield* AuthConfig;
  let windowStart = 0;
  let requests = 0;
  let active = 0;

  return {
    wrap:
      (
        operation: (
          request: HttpServerRequest.HttpServerRequest,
        ) => Effect.Effect<HttpServerResponse.HttpServerResponse, unknown>,
      ) =>
      (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          if (
            (request.method !== "GET" && request.headers.origin !== config.origin) ||
            (request.headers.origin && request.headers.origin !== config.origin) ||
            request.headers["sec-fetch-site"] === "cross-site"
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
          if (requests >= 120 || active >= 10) {
            return HttpServerResponse.jsonUnsafe(
              { error: "Authentication request limit reached" },
              { status: 429, headers: { "retry-after": "60" } },
            );
          }

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
            let message = "Authentication temporarily unavailable";

            if (Schema.is(AuthHttpError)(error)) {
              status = error.status;
              message = error.message;
            } else if (Schema.is(Unauthenticated)(error)) {
              status = 401;
              message = "Not authenticated";
            } else if (Schema.is(InvalidChallenge)(error) || Schema.is(InvalidSignature)(error)) {
              status = 401;
              message = "Invalid or expired sign-in request";
            }

            const response = HttpServerResponse.jsonUnsafe({ error: message }, { status });

            return status === 503
              ? Effect.logWarning("Authentication dependency unavailable").pipe(Effect.as(response))
              : Effect.succeed(response);
          }),
          Effect.map((response) =>
            response.pipe(
              HttpServerResponse.setHeaders({
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
              }),
            ),
          ),
        ),
  };
});

export class AuthMiddleware extends Context.Service<AuthMiddleware, Effect.Success<typeof make>>()(
  "server/AuthMiddleware",
) {
  static readonly layer = Layer.effect(AuthMiddleware, make);
}
