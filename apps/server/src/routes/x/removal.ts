import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { AuthConfig, XRemoval } from "@ens-social-verification/application";
import { XRemovalRequest } from "@ens-social-verification/protocol/dto";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { XMiddleware } from "../../middlewares/x.js";

export const XRemovalRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const removal = yield* XRemoval;
    const config = yield* AuthConfig;
    const middleware = yield* XMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      Layer.empty,
      ...(["options", "post"] as const).map((operation) =>
        HttpRouter.add(
          "POST",
          `/verification/x/removal/${operation}`,
          middleware.wrap((request) =>
            Effect.gen(function* () {
              const input = yield* readAuthBody(request).pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(XRemovalRequest))),
                Effect.mapError((error) =>
                  Schema.is(AuthHttpError)(error)
                    ? error
                    : new AuthHttpError({ status: 400, message: "Invalid removal request" }),
                ),
              );
              const response = yield* operation === "options"
                ? removal.options(input.name, input.proofUri, request.cookies[cookies.session])
                : removal.deletePost(input.name, input.proofUri, request.cookies[cookies.session]);
              return HttpServerResponse.jsonUnsafe(response);
            }),
          ),
        ),
      ),
    );
  }),
);
