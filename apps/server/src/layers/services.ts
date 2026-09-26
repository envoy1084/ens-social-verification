import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Redacted } from "effect";

import {
  Auth,
  AuthConfig,
  SepoliaClient,
  SignatureVerifier,
} from "@ens-social-verification/application";
import {
  ChallengeRepository,
  SessionRepository,
  TransactionService,
  Database,
} from "@ens-social-verification/database";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import { ServerConfig } from "../config.js";

const SepoliaClientLive = Layer.effect(
  SepoliaClient,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const key = Redacted.value(config.alchemyKey).trim();

    return createPublicClient({
      chain: sepolia,
      transport: http(`https://eth-sepolia.g.alchemy.com/v2/${encodeURIComponent(key)}`, {
        retryCount: 0,
        timeout: 10_000,
      }),
    });
  }),
);

export const AuthLive = Auth.layer.pipe(
  Layer.provide(NodeCrypto.layer),
  Layer.provide(
    Layer.mergeAll(
      ChallengeRepository.layer,
      SessionRepository.layer,
      TransactionService.layer,
    ).pipe(Layer.provide(Database.layer)),
  ),
  Layer.provide(SignatureVerifier.layer.pipe(Layer.provide(SepoliaClientLive))),
  Layer.provideMerge(AuthConfig.layer),
);
