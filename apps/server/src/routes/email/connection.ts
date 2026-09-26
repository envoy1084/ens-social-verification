import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { AuthConfig, EmailConnection } from "@ens-social-verification/application";
import { EmailStartRequest } from "@ens-social-verification/protocol/dto";
import { EmailAttemptId } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { EmailMiddleware } from "../../middlewares/email.js";

export const EmailConnectionRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const connection = yield* EmailConnection;
    const config = yield* AuthConfig;
    const middleware = yield* EmailMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/verification/email/attempts/:id/preview",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(EmailAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* connection.preview(id, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/email/start",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(EmailStartRequest))),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid Email request" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* connection.start(input.name, input.email, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/email/attempts/:id/complete",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(EmailAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* connection.complete(id, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
    );
  }),
);
