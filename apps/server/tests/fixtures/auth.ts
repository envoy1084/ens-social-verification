import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { ConfigProvider, Layer, ManagedRuntime } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import {
  Auth,
  AuthConfig,
  SignatureVerifier,
  SepoliaClient,
} from "@ens-social-verification/application";
import {
  ChallengeRepository,
  SessionRepository,
  TransactionService,
  Database,
} from "@ens-social-verification/database";
import { createPublicClient, custom, encodeAbiParameters } from "viem";
import { sepolia } from "viem/chains";

import { Cors } from "../../src/middlewares/cors.js";
import { AuthRoutes } from "../../src/routes/auth/index.js";

export function authFixture(databaseUrl: string, secure = false) {
  const origin = secure ? "https://social.example" : "http://localhost:3000";
  const rpc = { code: "0x", magicValue: "0x1626ba7e" as `0x${string}`, unavailable: false };
  const client = createPublicClient({
    chain: sepolia,
    transport: custom(
      {
        request: async ({ method }) => {
          if (rpc.unavailable) throw new Error("RPC unavailable");
          if (method === "eth_getCode") return rpc.code;
          if (method === "eth_call")
            return encodeAbiParameters([{ type: "bytes4" }], [rpc.magicValue]);
          throw new Error(`Unexpected RPC method: ${method}`);
        },
      },
      { retryCount: 0 },
    ),
  });
  const database = Database.layer.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ DATABASE_URL: databaseUrl }))),
  );
  const config = Layer.succeed(AuthConfig, { origin, secureCookies: secure });
  const auth = Auth.layer.pipe(
    Layer.provide(NodeCrypto.layer),
    Layer.provide(
      Layer.mergeAll(
        ChallengeRepository.layer,
        SessionRepository.layer,
        TransactionService.layer,
      ).pipe(Layer.provide(database)),
    ),
    Layer.provide(
      SignatureVerifier.layer.pipe(Layer.provide(Layer.succeed(SepoliaClient, client))),
    ),
    Layer.provideMerge(config),
  );
  const web = HttpRouter.toWebHandler(
    Layer.merge(AuthRoutes, Cors).pipe(
      Layer.provide(auth),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  );
  const runtime = ManagedRuntime.make(database);

  const request = (
    path: string,
    options: { body?: unknown; cookie?: string; origin?: string; method?: "GET" | "POST" } = {},
  ) =>
    web.handler(
      new Request(`${origin}/auth/${path}`, {
        method: options.method ?? "POST",
        headers: {
          origin: options.origin ?? origin,
          "content-type": "application/json",
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
    );

  return { ...web, runtime, rpc, request, origin, auth, database };
}

export function responseCookie(response: Response, prefix: string) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(prefix));
  if (!cookie) throw new Error(`Missing ${prefix} cookie`);
  return cookie.slice(0, cookie.indexOf(";"));
}
