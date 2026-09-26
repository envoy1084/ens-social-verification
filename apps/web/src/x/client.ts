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
              : "Couldn't complete the request. Check your connection and try again.",
          ),
      ),
    ),
    { signal },
  );
}

export const xClient = {
  removalOptions: (name: string, proofUri: string, signal?: AbortSignal) =>
    request(client.x.removalOptions({ payload: { name, proofUri } }), signal),
  deletePost: (name: string, proofUri: string) =>
    request(client.x.deletePost({ payload: { name, proofUri } })),
  configuration: (signal?: AbortSignal) => request(client.x.configuration(), signal),
  start: (name: string) => request(client.x.start({ payload: { name } })),
  attempt: (id: string, signal?: AbortSignal) =>
    request(client.x.attempt({ params: { id } }), signal),
  publication: (id: string, signal?: AbortSignal) =>
    request(client.x.publication({ params: { id } }), signal),
  publish: (id: string, signature: string) =>
    request(
      client.x.publish({
        params: { id },
        payload: { authoritySignature: Schema.decodeUnknownSync(VerificationSignature)(signature) },
      }),
    ),
  status: (name: string, signal?: AbortSignal) =>
    request(client.x.status({ query: { name } }), signal),
};
