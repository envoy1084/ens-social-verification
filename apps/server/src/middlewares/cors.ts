import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";

import { AuthConfig } from "@ens-social-verification/application";

export const Cors = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AuthConfig;
    return HttpRouter.cors({
      allowedOrigins: [config.origin],
      allowedMethods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "b3", "traceparent"],
      credentials: true,
      maxAge: 600,
    });
  }),
);
