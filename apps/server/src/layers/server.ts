import { createServer } from "node:http";

import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";

import { DatabaseMigration } from "@ens-social-verification/database";

import { ServerConfig } from "../config.js";
import { Routes } from "../routes/index.js";
import { FarcasterLive } from "./farcaster.js";
import { GithubLive } from "./services.js";
import { XLive } from "./x.js";

export const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    yield* DatabaseMigration;
    const config = yield* ServerConfig;
    return HttpRouter.serve(Routes, { disableLogger: true }).pipe(
      Layer.provide(Layer.mergeAll(GithubLive, FarcasterLive, XLive)),
      Layer.provide(NodeHttpClient.layerUndici),
      Layer.provide(NodeHttpServer.layer(createServer, { host: config.host, port: config.port })),
    );
  }),
).pipe(Layer.provide(ServerConfig.layer), Layer.provide(DatabaseMigration.layer));
