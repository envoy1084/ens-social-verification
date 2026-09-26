import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { AuthConfig, OAuthConnection, OAuthProofs } from "@ens-social-verification/application";
import { OAuthStartRequest } from "@ens-social-verification/protocol/dto";
import { OAuthError } from "@ens-social-verification/protocol/errors";
import { OAuthAttemptId, OAuthProviderId } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { OAuthMiddleware } from "../../middlewares/oauth.js";

export const OAuthConnectionRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const connection = yield* OAuthConnection;
    const proofs = yield* OAuthProofs;
    const config = yield* AuthConfig;
    const middleware = yield* OAuthMiddleware;
    const cookies = authCookies(config.secureCookies);
    const verifierCookie = config.secureCookies ? "__Host-ens-oauth" : "ens-oauth";
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/verification/oauth/:provider/configuration",
        middleware.wrap(() =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const provider = yield* Schema.decodeUnknownEffect(OAuthProviderId)(params.provider);
            return HttpServerResponse.jsonUnsafe(yield* connection.configuration(provider));
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/oauth/:provider/start",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const provider = yield* Schema.decodeUnknownEffect(OAuthProviderId)(params.provider);
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(OAuthStartRequest))),
              Effect.mapError(
                () => new AuthHttpError({ status: 400, message: "Invalid OAuth request" }),
              ),
            );
            const { id, authorizeUrl, verifier } = yield* connection.start(
              provider,
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
        "/verification/oauth/attempts/:id",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(OAuthAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* proofs.attempt(id, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/oauth/:provider/callback",
        middleware.wrap(
          (request) =>
            Effect.gen(function* () {
              const params = yield* HttpRouter.params;
              const provider = yield* Schema.decodeUnknownEffect(OAuthProviderId)(params.provider);
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
              )
                return HttpServerResponse.redirect(
                  `${config.origin}/oauth/callback?error=authorization`,
                );
              const attempt = yield* connection.callback(
                provider,
                { state, code, verifier },
                request.cookies[cookies.session],
              );
              return HttpServerResponse.redirect(
                `${config.origin}/${encodeURIComponent(attempt.name)}?oauthAttempt=${attempt.id}`,
              );
            }).pipe(
              Effect.catch((error) =>
                Effect.logWarning("OAuth callback failed", {
                  reason: Schema.is(OAuthError)(error)
                    ? error.message
                    : "Invalid or expired authorization session",
                }).pipe(
                  Effect.as(
                    HttpServerResponse.redirect(
                      `${config.origin}/oauth/callback?error=authorization`,
                    ),
                  ),
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
