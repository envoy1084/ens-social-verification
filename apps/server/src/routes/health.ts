import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { ServerConfig } from "../config.js";

export const HealthRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        "/health",
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { status: "ok" },
            { headers: { "cache-control": "no-store" } },
          ),
        ),
      ),
      HttpRouter.add(
        "GET",
        "/health/ready",
        Effect.sync(() => {
          return Redacted.value(config.alchemyKey).trim()
            ? HttpServerResponse.jsonUnsafe(
                { status: "ready" },
                { headers: { "cache-control": "no-store" } },
              )
            : HttpServerResponse.jsonUnsafe(
                { error: "Alchemy is not configured" },
                { status: 503, headers: { "cache-control": "no-store" } },
              );
        }),
      ),
    );
  }),
);
