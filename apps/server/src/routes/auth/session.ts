import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { Auth, AuthConfig } from "@ens-social-verification/application";

import { authCookies } from "../../helpers/auth-cookie.js";
import { AuthMiddleware } from "../../middlewares/auth.js";

export const AuthSessionRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const auth = yield* Auth;
    const config = yield* AuthConfig;
    const middleware = yield* AuthMiddleware;
    const cookies = authCookies(config.secureCookies);

    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/auth/session",
        middleware.wrap((request) =>
          auth
            .session(request.cookies[cookies.session])
            .pipe(Effect.map(HttpServerResponse.jsonUnsafe)),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/auth/logout",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            yield* auth.logout(request.cookies[cookies.session]);

            return HttpServerResponse.empty({ status: 204 }).pipe(
              HttpServerResponse.expireCookieUnsafe(cookies.session, cookies.options),
              HttpServerResponse.expireCookieUnsafe(cookies.challenge, cookies.options),
            );
          }),
        ),
      ),
    );
  }),
);
