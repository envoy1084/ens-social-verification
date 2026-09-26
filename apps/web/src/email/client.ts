import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { Api } from "@ens-social-verification/api";
import { VerificationSignature } from "@ens-social-verification/protocol/schema";

import { env } from "../env";

const client = Effect.runSync(
  HttpApiClient.make(Api, { baseUrl: env.serverUrl }).pipe(Effect.provide(FetchHttpClient.layer)),
);
const apiError = Schema.Struct({ error: Schema.String });

function request<A, E>(operation: Effect.Effect<A, E>, signal?: AbortSignal) {
  return Effect.runPromise(
    operation.pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        credentials: "include",
        cache: "no-store",
      }),
      Effect.timeout("60 seconds"),
      Effect.mapError(
        (error) =>
          new Error(
            Schema.is(apiError)(error)
              ? error.error
              : "Couldn't complete the Email request. Try again.",
          ),
      ),
    ),
    { signal },
  );
}

export const emailClient = {
  preview: (id: string) => request(client.email.preview({ params: { id } })),
  removeProof: (name: string, proofUri: string) =>
    request(client.email.removeProof({ payload: { name, proofUri } })),
  start: (name: string, email: string) => request(client.email.start({ payload: { name, email } })),
  complete: (id: string, signal?: AbortSignal) =>
    request(client.email.complete({ params: { id } }), signal),
  publish: (id: string, signature: string) =>
    request(
      client.email.publish({
        params: { id },
        payload: {
          consent: true,
          authoritySignature: Schema.decodeUnknownSync(VerificationSignature)(signature),
        },
      }),
    ),
  status: (name: string, signal?: AbortSignal) =>
    request(client.email.status({ query: { name } }), signal),
};
