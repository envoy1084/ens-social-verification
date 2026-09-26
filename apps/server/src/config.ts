import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly host: string;
    readonly port: number;
    readonly alchemyKey: Redacted.Redacted<string>;
  }
>()("server/ServerConfig") {
  static readonly layer = Layer.effect(
    ServerConfig,
    Effect.gen(function* () {
      const port = yield* Config.Int("PORT").pipe(Config.withDefault(8080));
      yield* Schema.decodeUnknownEffect(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
      )(port);
      return {
        host: yield* Config.String("HOST").pipe(Config.withDefault("127.0.0.1")),
        port,
        alchemyKey: yield* Config.Redacted("ALCHEMY_API_KEY").pipe(
          Config.withDefault(Redacted.make("")),
        ),
      };
    }),
  );
}
