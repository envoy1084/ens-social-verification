import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Redacted } from "effect";

import {
  FarcasterAuthClient,
  FarcasterAuthority,
  FarcasterConfig,
  FarcasterConnection,
  FarcasterProofs,
  FarcasterProvider,
} from "@ens-social-verification/application";
import { Database, FarcasterAttemptRepository } from "@ens-social-verification/database";
import { createAppClient, viemConnector } from "@farcaster/auth-client";

import { ServerConfig } from "../config.js";
import { AuthLive, RecordVerificationLive } from "./services.js";

const FarcasterAuthClientLive = Layer.effect(
  FarcasterAuthClient,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    return createAppClient({
      ethereum: viemConnector({
        rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${encodeURIComponent(Redacted.value(config.alchemyKey).trim())}`,
      }),
    });
  }),
);

export const FarcasterLive = FarcasterProofs.layer.pipe(
  Layer.provideMerge(FarcasterConnection.layer),
  Layer.provide(
    Layer.mergeAll(
      FarcasterAuthority.layer,
      FarcasterProvider.layer.pipe(Layer.provide(FarcasterAuthClientLive)),
    ),
  ),
  Layer.provide(FarcasterAttemptRepository.layer.pipe(Layer.provide(Database.layer))),
  Layer.provide(RecordVerificationLive),
  Layer.provide(NodeCrypto.layer),
  Layer.provide(AuthLive),
  Layer.provide(FarcasterConfig.layer),
);
