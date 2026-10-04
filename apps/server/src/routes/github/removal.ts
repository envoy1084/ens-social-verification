import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { AuthConfig, GithubRemoval } from "@ens-social-verification/application";
import { GithubRemovalRequest } from "@ens-social-verification/protocol/dto";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { GithubMiddleware } from "../../middlewares/github.js";

export const GithubRemovalRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const removal = yield* GithubRemoval;
    const config = yield* AuthConfig;
    const middleware = yield* GithubMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      Layer.empty,
      ...(["options", "gist"] as const).map((operation) =>
        HttpRouter.add(
          "POST",
          `/verification/github/removal/${operation}`,
          middleware.wrap((request) =>
            Effect.gen(function* () {
              const input = yield* readAuthBody(request).pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(Schema.fromJsonString(GithubRemovalRequest)),
                ),
                Effect.mapError((error) =>
                  Schema.is(AuthHttpError)(error)
                    ? error
                    : new AuthHttpError({ status: 400, message: "Invalid removal request" }),
                ),
              );
              const response = yield* operation === "options"
                ? removal.options(input.name, input.proofUri, request.cookies[cookies.session])
                : removal.deleteGist(input.name, input.proofUri, request.cookies[cookies.session]);
              return HttpServerResponse.jsonUnsafe(response);
            }),
          ),
        ),
      ),
    );
  }),
);
