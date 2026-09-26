import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { AuthConfig, GithubProofs } from "@ens-social-verification/application";
import { GithubFinalizeRequest } from "@ens-social-verification/protocol/dto";
import { GithubAttemptId, GithubName } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { GithubMiddleware } from "../../middlewares/github.js";

export const GithubProofRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const proofs = yield* GithubProofs;
    const config = yield* AuthConfig;
    const middleware = yield* GithubMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/verification/github/attempts/:id/publication",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(GithubAttemptId)(params.id).pipe(
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
        "/verification/github/attempts/:id/publish",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(GithubAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(GithubFinalizeRequest)),
              ),
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
        "/verification/github/status",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const name = yield* Schema.decodeUnknownEffect(GithubName)(
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
