import { createServer } from "node:http";

import { NodeHttpClient, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";

import { ServerConfig } from "./config.js";
import { Routes } from "./routes/index.js";

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    return HttpRouter.serve(Routes, { disableLogger: true }).pipe(
      Layer.provide(NodeHttpClient.layerUndici),
      Layer.provide(NodeHttpServer.layer(createServer, { host: config.host, port: config.port })),
    );
  }),
).pipe(Layer.provide(ServerConfig.layer));

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
