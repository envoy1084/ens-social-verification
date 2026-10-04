import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { AuthConfig, FarcasterConnection } from "@ens-social-verification/application";
import {
  FarcasterStartRequest,
  FarcasterCompleteRequest,
} from "@ens-social-verification/protocol/dto";
import { FarcasterAttemptId } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { FarcasterMiddleware } from "../../middlewares/farcaster.js";

export const FarcasterConnectionRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const connection = yield* FarcasterConnection;
    const config = yield* AuthConfig;
    const middleware = yield* FarcasterMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "POST",
        "/verification/farcaster/start",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(FarcasterStartRequest)),
              ),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid Farcaster request" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* connection.start(input.name, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/farcaster/attempts/:id/complete",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(FarcasterAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(FarcasterCompleteRequest)),
              ),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid Farcaster approval" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* connection.complete(id, input, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
    );
  }),
);
