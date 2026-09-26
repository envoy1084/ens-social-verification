import { Config, Context, Effect, Layer } from "effect";

export class FarcasterConfig extends Context.Service<
  FarcasterConfig,
  { readonly proofOrigin: string }
>()("application/FarcasterConfig") {
  static readonly layer = Layer.effect(
    FarcasterConfig,
    Effect.gen(function* () {
      const proofOrigin = yield* Config.String("PUBLIC_SERVER_URL");
      const url = yield* Effect.try(() => new URL(proofOrigin));
      if (url.origin !== proofOrigin || url.protocol !== "https:" || url.username || url.password)
        return yield* Effect.fail(
          new Error("PUBLIC_SERVER_URL must be an HTTPS origin for public verification proofs"),
        );
      return { proofOrigin };
    }),
  );
}
