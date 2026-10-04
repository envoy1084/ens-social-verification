import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";

import {
  FarcasterAuthClient,
  FarcasterAuthority,
  FarcasterConfig,
  FarcasterConnection,
  FarcasterProofs,
  FarcasterProvider,
  VerificationClient,
} from "@ens-social-verification/application";
import { FarcasterAttemptRepository } from "@ens-social-verification/database";
import { FarcasterError } from "@ens-social-verification/protocol/errors";
import { createAppClient } from "@farcaster/auth-client";
import { createPublicClient, custom, type Address } from "viem";
import { optimism } from "viem/chains";

import { FarcasterRoutes } from "../../src/routes/farcaster/index.js";
import { authFixture } from "./auth.js";
import { ensRecordFixture } from "./ens-records.js";

export function farcasterFixture(databaseUrl: string, owner: Address, custody: Address) {
  const auth = authFixture(databaseUrl);
  const ens = ensRecordFixture(owner);
  const identity = {
    fid: 123n,
    username: "alice",
    authAddress: false,
    custodyActive: true,
    unavailable: false,
  };
  const client = createAppClient({
    ethereum: {
      publicClient: createPublicClient({
        chain: optimism,
        transport: custom({ request: async () => "0x" }, { retryCount: 0 }),
      }),
      getFid: async (address) => {
        if (identity.unavailable) throw new Error("Unavailable");
        return identity.custodyActive && address.toLowerCase() === custody.toLowerCase()
          ? identity.fid
          : 0n;
      },
      isValidAuthAddress: async (address, fid) =>
        address.toLowerCase() === custody.toLowerCase() &&
        fid === identity.fid &&
        identity.authAddress,
    },
  });
  const provider = Layer.effect(
    FarcasterProvider,
    Effect.gen(function* () {
      const live = yield* FarcasterProvider;
      return {
        ...live,
        verifyUsername: (username: string, fid: number) =>
          (username === identity.username || username === `fid:${fid}`) &&
          BigInt(fid) === identity.fid
            ? Effect.succeed(undefined)
            : Effect.fail(
                new FarcasterError({ code: "INVALID_PROOF", message: "Username changed" }),
              ),
      };
    }),
  ).pipe(
    Layer.provide(
      FarcasterProvider.layer.pipe(Layer.provide(Layer.succeed(FarcasterAuthClient, client))),
    ),
  );
  const services = FarcasterProofs.layer.pipe(
    Layer.provideMerge(FarcasterConnection.layer),
    Layer.provide(Layer.mergeAll(FarcasterAuthority.layer, provider)),
    Layer.provide(FarcasterAttemptRepository.layer.pipe(Layer.provide(auth.database))),
    Layer.provide(Layer.succeed(VerificationClient, ens.sdk)),
    Layer.provide(NodeCrypto.layer),
    Layer.provideMerge(auth.auth),
    Layer.provide(Layer.succeed(FarcasterConfig, { proofOrigin: "https://api.example.com" })),
  );
  const web = HttpRouter.toWebHandler(
    FarcasterRoutes.pipe(Layer.provide(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  const request = (
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string } = {},
  ) =>
    web.handler(
      new Request(`http://localhost:8080/verification/farcaster/${path}`, {
        method: options.body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          origin: options.origin ?? auth.origin,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
    );
  return { ...web, auth, ...ens, identity, request };
}
