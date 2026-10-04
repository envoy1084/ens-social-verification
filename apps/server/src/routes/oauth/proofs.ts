import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { AuthConfig, OAuthProofs } from "@ens-social-verification/application";
import { OAuthPublishRequest, OAuthRemovalRequest } from "@ens-social-verification/protocol/dto";
import {
  OAuthAttemptId,
  OAuthName,
  OAuthProviderId,
} from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { OAuthMiddleware } from "../../middlewares/oauth.js";

export const OAuthProofRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const proofs = yield* OAuthProofs;
    const config = yield* AuthConfig;
    const middleware = yield* OAuthMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/verification/oauth/proofs/:id",
        middleware.wrap(() =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(OAuthAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid proof" })),
            );
            return HttpServerResponse.jsonUnsafe(yield* proofs.proof(id));
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/oauth/attempts/:id/publish",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(OAuthAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(OAuthPublishRequest)),
              ),
              Effect.mapError(
                () => new AuthHttpError({ status: 400, message: "Invalid signature request" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* proofs.publish(id, input.authoritySignature, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/oauth/:provider/status",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const provider = yield* Schema.decodeUnknownEffect(OAuthProviderId)(params.provider);
            const name = yield* Schema.decodeUnknownEffect(OAuthName)(
              new URL(request.url, "http://localhost").searchParams.get("name"),
            ).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid name" })),
            );
            return HttpServerResponse.jsonUnsafe(yield* proofs.status(provider, name));
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/oauth/:provider/removal",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const provider = yield* Schema.decodeUnknownEffect(OAuthProviderId)(params.provider);
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(OAuthRemovalRequest)),
              ),
              Effect.mapError(
                () => new AuthHttpError({ status: 400, message: "Invalid removal request" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* proofs.remove(
                provider,
                input.name,
                input.proofUri,
                request.cookies[cookies.session],
              ),
            );
          }),
        ),
      ),
    );
  }),
);
