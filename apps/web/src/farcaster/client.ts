import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import { Api } from "@ens-social-verification/api";
import type { FarcasterCompleteRequest } from "@ens-social-verification/protocol/dto";
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
              : "Couldn't complete the Farcaster request. Try again.",
          ),
      ),
    ),
    { signal },
  );
}

export const farcasterClient = {
  removeProof: (name: string, proofUri: string) =>
    request(client.farcaster.removeProof({ payload: { name, proofUri } })),
  start: (name: string) => request(client.farcaster.start({ payload: { name } })),
  complete: (id: string, payload: typeof FarcasterCompleteRequest.Type) =>
    request(client.farcaster.complete({ params: { id }, payload })),
  publish: (id: string, signature: string) =>
    request(
      client.farcaster.publish({
        params: { id },
        payload: { authoritySignature: Schema.decodeUnknownSync(VerificationSignature)(signature) },
      }),
    ),
  status: (name: string, signal?: AbortSignal) =>
    request(client.farcaster.status({ query: { name } }), signal),
};
