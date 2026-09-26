import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Redacted, Schedule } from "effect";

import {
  Auth,
  AuthConfig,
  SepoliaClient,
  SignatureVerifier,
  VerificationClient,
  createVerificationClient,
  GithubAuthority,
  GithubConfig,
  GithubOAuth,
  GithubProofs,
  GithubProvider,
  GithubTokens,
} from "@ens-social-verification/application";
import {
  ChallengeRepository,
  SessionRepository,
  TransactionService,
  Database,
  GithubAttemptRepository,
  GithubPublicationRepository,
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

export const RecordVerificationLive = Layer.effect(
  VerificationClient,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const key = Redacted.value(config.alchemyKey).trim();
    return createVerificationClient(
      createPublicClient({
        chain: sepolia,
        ccipRead: false,
        transport: http(`https://eth-sepolia.g.alchemy.com/v2/${encodeURIComponent(key)}`, {
          retryCount: 0,
          timeout: 10_000,
        }),
      }),
    );
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

const GithubCleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const attempts = yield* GithubAttemptRepository;
    yield* attempts.clearExpiredTokens().pipe(
      Effect.catch(() => Effect.logWarning("Expired GitHub token cleanup failed")),
      Effect.repeat(Schedule.spaced("1 minute")),
      Effect.forkScoped,
    );
  }),
);

export const GithubLive = Layer.merge(GithubProofs.layer, GithubCleanup).pipe(
  Layer.provideMerge(GithubOAuth.layer),
  Layer.provide(Layer.mergeAll(GithubAuthority.layer, GithubProvider.layer, GithubTokens.layer)),
  Layer.provide(
    Layer.mergeAll(GithubAttemptRepository.layer, GithubPublicationRepository.layer).pipe(
      Layer.provide(Database.layer),
    ),
  ),
  Layer.provide(RecordVerificationLive),
  Layer.provide(NodeCrypto.layer),
  Layer.provideMerge(AuthLive),
  Layer.provideMerge(GithubConfig.layer),
);
