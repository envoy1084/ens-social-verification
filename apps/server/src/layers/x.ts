import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Schedule } from "effect";

import {
  XAuthority,
  XConfig,
  XOAuth,
  XProofs,
  XProvider,
  XRemoval,
  XTokens,
} from "@ens-social-verification/application";
import {
  Database,
  XAttemptRepository,
  XPublicationRepository,
} from "@ens-social-verification/database";

import { AuthLive, RecordVerificationLive } from "./services.js";

const XCleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const attempts = yield* XAttemptRepository;
    yield* attempts.clearExpiredTokens().pipe(
      Effect.catch(() => Effect.logWarning("Expired X token cleanup failed")),
      Effect.repeat(Schedule.spaced("1 minute")),
      Effect.forkScoped,
    );
  }),
);

export const XLive = Layer.mergeAll(XRemoval.layer, XCleanup).pipe(
  Layer.provideMerge(XProofs.layer),
  Layer.provideMerge(XOAuth.layer),
  Layer.provide(Layer.mergeAll(XAuthority.layer, XProvider.layer, XTokens.layer)),
  Layer.provide(
    Layer.mergeAll(XAttemptRepository.layer, XPublicationRepository.layer).pipe(
      Layer.provide(Database.layer),
    ),
  ),
  Layer.provide(RecordVerificationLive),
  Layer.provide(NodeCrypto.layer),
  Layer.provideMerge(AuthLive),
  Layer.provideMerge(XConfig.layer),
);
