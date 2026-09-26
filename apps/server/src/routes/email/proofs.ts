import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { AuthConfig, EmailProofs } from "@ens-social-verification/application";
import { EmailPublishRequest, EmailRemovalRequest } from "@ens-social-verification/protocol/dto";
import { EmailAttemptId, EmailName } from "@ens-social-verification/protocol/schema";

import { AuthHttpError, readAuthBody } from "../../helpers/auth-body.js";
import { authCookies } from "../../helpers/auth-cookie.js";
import { EmailMiddleware } from "../../middlewares/email.js";

export const EmailProofRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const proofs = yield* EmailProofs;
    const config = yield* AuthConfig;
    const middleware = yield* EmailMiddleware;
    const cookies = authCookies(config.secureCookies);
    return Layer.mergeAll(
      HttpRouter.add(
        "POST",
        "/verification/email/removal",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(EmailRemovalRequest)),
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
        "/verification/email/attempts/:id/publish",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(EmailAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid attempt" })),
            );
            const input = yield* readAuthBody(request).pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(EmailPublishRequest)),
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
        "/verification/email/proofs/:id",
        middleware.wrap(() =>
          Effect.gen(function* () {
            const params = yield* HttpRouter.params;
            const id = yield* Schema.decodeUnknownEffect(EmailAttemptId)(params.id).pipe(
              Effect.mapError(() => new AuthHttpError({ status: 400, message: "Invalid proof" })),
            );
            return HttpServerResponse.jsonUnsafe(yield* proofs.proof(id));
          }),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/verification/email/status",
        middleware.wrap((request) =>
          Effect.gen(function* () {
            const name = yield* Schema.decodeUnknownEffect(EmailName)(
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
