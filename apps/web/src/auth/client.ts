import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClientResponse } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

import { Api } from "@ens-social-verification/api";
import { AuthSession, type AuthMessageRequest } from "@ens-social-verification/protocol/dto";
import { EthereumSignature } from "@ens-social-verification/protocol/schema";

import { env } from "../env";

const client = Effect.runSync(
  HttpApiClient.make(Api, { baseUrl: env.serverUrl }).pipe(Effect.provide(FetchHttpClient.layer)),
);

function request<A, E>(operation: Effect.Effect<A, E>, signal?: AbortSignal) {
  return Effect.runPromise(
    operation.pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        credentials: "include",
        cache: "no-store",
      }),
      Effect.timeout("15 seconds"),
    ),
    { signal },
  );
}

export const authClient = {
  nonce: () => request(client.authWallet.nonce()),
  message: (payload: typeof AuthMessageRequest.Type) =>
    request(client.authWallet.message({ payload })),
  verify: (message: string, signature: string) =>
    request(
      client.authWallet.verify({
        payload: {
          message,
          signature: Schema.decodeUnknownSync(EthereumSignature)(signature),
        },
      }),
    ),
  logout: () => request(client.authSession.logout()),
  session: (signal?: AbortSignal) =>
    request(
      Effect.gen(function* () {
        const response = yield* client.authSession.session({ responseMode: "response-only" });
        if (response.status === 401) return null;
        if (response.status !== 200)
          return yield* Effect.fail(new Error("Unable to restore session"));
        return yield* HttpClientResponse.schemaBodyJson(AuthSession)(response);
      }),
      signal,
    ),
};
