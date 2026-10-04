import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

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
      Effect.timeout("30 seconds"),
      Effect.mapError(
        (error) =>
          new Error(
            Schema.is(apiError)(error)
              ? error.error
              : "Couldn't complete verification. Please try again.",
          ),
      ),
    ),
    { signal },
  );
}

export const oauthClient = {
  configuration: (provider: string, signal?: AbortSignal) =>
    request(client.oauth.configuration({ params: { provider } }), signal),
  start: (provider: string, name: string) =>
    request(client.oauth.start({ params: { provider }, payload: { name } })),
  attempt: (id: string, signal?: AbortSignal) =>
    request(client.oauth.attempt({ params: { id } }), signal),
  publish: (id: string, signature: string) =>
    request(
      client.oauth.publish({
        params: { id },
        payload: { authoritySignature: Schema.decodeUnknownSync(VerificationSignature)(signature) },
      }),
    ),
  status: (provider: string, name: string, signal?: AbortSignal) =>
    request(client.oauth.status({ params: { provider }, query: { name } }), signal),
  remove: (provider: string, name: string, proofUri: string) =>
    request(client.oauth.removal({ params: { provider }, payload: { name, proofUri } })),
};

export function oauthProofLink(proofUri: string) {
  return import.meta.env.DEV &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.serverUrl).hostname)
    ? new URL(new URL(proofUri).pathname, env.serverUrl).href
    : proofUri;
}
