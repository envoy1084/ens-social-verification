import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { AuthConfig, FarcasterProofs } from "@ens-social-verification/application";
import {
  FarcasterPublishRequest,
  FarcasterRemovalRequest,
} from "@ens-social-verification/protocol/dto";
import { FarcasterAttemptId, FarcasterName } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { FarcasterMiddleware } from "../../middlewares/farcaster.js";

export const FarcasterProofRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const proofs = yield* FarcasterProofs;
    const config = yield* AuthConfig;
    const middleware = yield* FarcasterMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "POST",
        "/verification/farcaster/removal",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(FarcasterRemovalRequest)),
              ),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid removal request" }),
              ),
            );
            return HttpServerResponse.jsonUnsafe(
              yield* proofs.remove(input.name, input.proofUri, request.cookies[cookies.session]),
            );
          }),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/verification/farcaster/attempts/:id/publish",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(FarcasterAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(FarcasterPublishRequest)),
              ),
              Effect.mapError((error) =>
                Schema.is(AuthHttpError)(error)
                  ? error
                  : new AuthHttpError({ status: 400, message: "Invalid publication request" }),
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
        "/verification/farcaster/proofs/:id",
        middleware.wrap(() =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(FarcasterAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid proof" })),
            );
            return HttpServerResponse.jsonUnsafe(yield* proofs.proof(id));
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/farcaster/status",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const name = yield* Schema.decodeUnknownEffect(FarcasterName)(
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
