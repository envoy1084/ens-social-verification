import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Schedule } from "effect";

import {
  OAuthAttestor,
  OAuthAuthority,
  OAuthConfig,
  OAuthConnection,
  OAuthProofs,
  OAuthProvider,
} from "@ens-social-verification/application";
import {
  Database,
  OAuthAttemptRepository,
  OAuthAttestationRepository,
} from "@ens-social-verification/database";

import { AuthLive, RecordVerificationLive } from "./services.js";

const Cleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const attempts = yield* OAuthAttemptRepository;
    yield* attempts.clearExpired().pipe(
      Effect.catch(() => Effect.logWarning("Expired OAuth attempt cleanup failed")),
      Effect.repeat(Schedule.spaced("5 minutes")),
      Effect.forkScoped,
    );
  }),
);

export const OAuthLive = Layer.mergeAll(OAuthProofs.layer, Cleanup).pipe(
  Layer.provideMerge(OAuthConnection.layer),
  Layer.provide(Layer.mergeAll(OAuthAuthority.layer, OAuthProvider.layer, OAuthAttestor.layer)),
  Layer.provide(
    Layer.mergeAll(OAuthAttemptRepository.layer, OAuthAttestationRepository.layer).pipe(
      Layer.provide(Database.layer),
    ),
  ),
  Layer.provide(RecordVerificationLive),
  Layer.provide(NodeCrypto.layer),
  Layer.provideMerge(AuthLive),
  Layer.provide(OAuthConfig.layer),
);
