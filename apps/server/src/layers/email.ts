import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Schedule } from "effect";

import {
  EmailAuthority,
  EmailConfig,
  EmailConnection,
  EmailProofs,
  EmailProvider,
} from "@ens-social-verification/application";
import { Database, EmailAttemptRepository } from "@ens-social-verification/database";

import { AuthLive, RecordVerificationLive } from "./services.js";

const Cleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const attempts = yield* EmailAttemptRepository;
    yield* attempts.clearExpired().pipe(
      Effect.catch(() => Effect.logWarning("Expired email challenge cleanup failed")),
      Effect.repeat(Schedule.spaced("5 minutes")),
      Effect.forkScoped,
    );
  }),
);

export const EmailLive = Layer.mergeAll(EmailProofs.layer, Cleanup).pipe(
  Layer.provideMerge(EmailConnection.layer),
  Layer.provide(Layer.mergeAll(EmailAuthority.layer, EmailProvider.layer)),
  Layer.provide(EmailAttemptRepository.layer.pipe(Layer.provide(Database.layer))),
  Layer.provide(RecordVerificationLive),
  Layer.provide(NodeCrypto.layer),
  Layer.provide(AuthLive),
  Layer.provide(EmailConfig.layer),
);
