import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { AuthConfig, XProofs } from "@ens-social-verification/application";
import { XFinalizeRequest } from "@ens-social-verification/protocol/dto";
import { XAttemptId, XName } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { XMiddleware } from "../../middlewares/x.js";

export const XProofRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const proofs = yield* XProofs;
    const config = yield* AuthConfig;
    const middleware = yield* XMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/verification/x/proofs/:id",
        middleware.wrap(() =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(XAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid proof" })),
            );
            return HttpServerResponse.jsonUnsafe(yield* proofs.proof(id));
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/x/attempts/:id/publication",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(XAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* proofs.published(id, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/x/attempts/:id/publish",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(XAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(XFinalizeRequest))),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid signature request" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* proofs.finalize(
                id,
                input.authoritySignature,
                request.cookies[cookies.session],
              ),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/x/status",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const name = yield* Schema.decodeUnknownEffect(XName)(
              new URL(request.url, "http://localhost").searchParams.get("name"),
            ).pipe(
              Effect.mapError(
                () => new AuthHttpError({ status: 400, message: "Invalid ENS name" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(yield* proofs.status(name));
          }),
        ),
      ),
    );
  }),
);
