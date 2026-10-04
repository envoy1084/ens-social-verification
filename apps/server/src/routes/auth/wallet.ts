import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import {
  Auth,
  AuthConfig,
  challengeLifetime,
  sessionLifetime,
} from "@ens-social-verification/application";
import { AuthMessageRequest, AuthVerifyRequest } from "@ens-social-verification/protocol/dto";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { AuthMiddleware } from "../../middlewares/auth.js";

export const AuthWalletRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const auth = yield* Auth;
    const config = yield* AuthConfig;
    const middleware = yield* AuthMiddleware;
    const cookies = authCookies(config.secureCookies);

    return Layer.mergeAll(
      HttpRouter.add(
        "POST",
        "/auth/nonce",
        middleware.wrap(() =>
          Effect.gen(function* () {
            const { nonce, browserToken } = yield* auth.nonce();

            return HttpServerResponse.jsonUnsafe({ nonce }).pipe(
              HttpServerResponse.setCookieUnsafe(cookies.challenge, browserToken, {
                ...cookies.options,
                maxAge: `${challengeLifetime} seconds`,
              }),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/auth/message",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(AuthMessageRequest))),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid message request" }),
              ),
            );
            const response = yield* auth.message(input, request.cookies[cookies.challenge]);

            return HttpServerResponse.jsonUnsafe(response);
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/auth/verify",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(AuthVerifyRequest))),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid verification request" }),
              ),
            );
            const { token, session } = yield* auth.verify(
              input,
              request.cookies[cookies.challenge],
              request.cookies[cookies.session],
            );

            return HttpServerResponse.jsonUnsafe(session).pipe(
              HttpServerResponse.setCookieUnsafe(cookies.session, token, {
                ...cookies.options,
                maxAge: `${sessionLifetime} seconds`,
              }),
              HttpServerResponse.expireCookieUnsafe(cookies.challenge, cookies.options),
            );
          }),
        ),
      ),
    );
  }),
);
