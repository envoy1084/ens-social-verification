import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { AuthConfig, XConfig, XOAuth } from "@ens-social-verification/application";
import { XStartRequest } from "@ens-social-verification/protocol/dto";
import { XAttemptId } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { XMiddleware } from "../../middlewares/x.js";

export const XOAuthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const oauth = yield* XOAuth;
    const config = yield* AuthConfig;
    const x = yield* XConfig;
    const middleware = yield* XMiddleware;
    const cookies = authCookies(config.secureCookies);
    const verifierCookie = config.secureCookies ? "__Host-ens-x" : "ens-x";

    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/verification/x/configuration",
        middleware.wrap(() =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ enabled: x.enabled })),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/x/start",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(XStartRequest))),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid ENS name" }),
              ),
            );
            const { id, authorizeUrl, verifier } = yield* oauth.start(
              input.name,
              request.cookies[cookies.session],
            );
            return HttpServerResponse.jsonUnsafe({ id, authorizeUrl }).pipe(
              HttpServerResponse.setCookieUnsafe(verifierCookie, verifier, {
                ...cookies.options,
                maxAge: "15 minutes",
              }),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/x/attempts/:id",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(XAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const attempt = yield* oauth.attempt(id, request.cookies[cookies.session]);
            return HttpServerResponse.jsonUnsafe({
              id: attempt.id,
              name: attempt.name,
              status: attempt.status,
              identity: attempt.identity,
              claim: attempt.claim,
              expiresAt: attempt.expiresAt.toISOString(),
            });
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/x/callback",
        middleware.wrap(
          (request) =>
            Effect.gen(function* () {
              const query = new URL(request.url, "http://localhost").searchParams;
              const state = query.get("state") ?? "";
              const code = query.get("code") ?? "";
              const verifier = request.cookies[verifierCookie] ?? "";
              if (
                query.has("error") ||
                query.getAll("state").length !== 1 ||
                query.getAll("code").length !== 1 ||
                !/^[a-zA-Z0-9_-]{43}$/.test(state) ||
                !/^[a-zA-Z0-9._~-]{1,1024}$/.test(code) ||
                !/^[a-zA-Z0-9_-]{43}$/.test(verifier)
              ) {
                return HttpServerResponse.redirect(
                  `${config.origin}/x/callback?error=authorization`,
                );
              }
              const attempt = yield* oauth.callback(
                { state, code, verifier },
                request.cookies[cookies.session],
              );
              return HttpServerResponse.redirect(
                `${config.origin}/${encodeURIComponent(attempt.name)}?xAttempt=${attempt.id}`,
              );
            }).pipe(
              Effect.catch(() =>
                Effect.succeed(
                  HttpServerResponse.redirect(`${config.origin}/x/callback?error=authorization`),
                ),
              ),
              Effect.map((response) =>
                response.pipe(
                  HttpServerResponse.expireCookieUnsafe(verifierCookie, cookies.options),
                ),
              ),
            ),
          true,
        ),
      ),
    );
  }),
);
