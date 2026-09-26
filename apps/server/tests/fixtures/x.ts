import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";

import {
  XAuthority,
  XConfig,
  XOAuth,
  XProofs,
  XRemoval,
  XProvider,
  XTokens,
  VerificationClient,
} from "@ens-social-verification/application";
import { XAttemptRepository, XPublicationRepository } from "@ens-social-verification/database";
import { XError } from "@ens-social-verification/protocol/errors";
import type { Address } from "viem";

import { XRoutes } from "../../src/routes/x/index.js";
import { authFixture } from "./auth.js";
import { ensRecordFixture } from "./ens-records.js";

export function xFixture(databaseUrl: string, owner: Address) {
  const auth = authFixture(databaseUrl);
  const { sdk, rpc, records } = ensRecordFixture(owner);
  const identity = { id: "123", login: "alice" };
  const post = {
    id: "1900000000000000000",
    author_id: "123",
    text: "",
    editHistoryIds: ["1900000000000000000"],
  };
  let creations = 0;
  let deletions = 0;
  const failure = { unavailable: false, ambiguous: false };
  const provider = Layer.succeed(XProvider, {
    deletePost: () =>
      Effect.sync(() => {
        deletions++;
      }),
    exchange: () => Effect.succeed({ identity, token: Redacted.make("test-x-token") }),
    currentUser: () => Effect.succeed(identity),
    lookup: () => Effect.succeed(identity),
    createPost: (_token, text) =>
      Effect.gen(function* () {
        creations++;
        if (failure.ambiguous)
          return yield* new XError({ code: "UNAVAILABLE", message: "Ambiguous write" });
        post.text = text;
        return post.id;
      }),
    readPost: (id) =>
      failure.unavailable
        ? Effect.fail(new XError({ code: "UNAVAILABLE", message: "X API billing unavailable" }))
        : id === post.id
          ? Effect.succeed(post)
          : Effect.fail(new XError({ code: "INVALID_PROOF", message: "Post missing" })),
  });
  const config = Layer.succeed(XConfig, {
    enabled: true,
    clientId: "test",
    clientSecret: Redacted.make("secret"),
    redirectUri: "http://localhost:8080/verification/x/callback",
    tokenEncryptionKey: Redacted.make("34".repeat(32)),
    apiToken: Redacted.make(""),
    proofOrigin: "https://api.example.test",
  });
  const services = XRemoval.layer.pipe(
    Layer.provideMerge(XProofs.layer),
    Layer.provideMerge(XOAuth.layer),
    Layer.provide(Layer.mergeAll(XAuthority.layer, XTokens.layer)),
    Layer.provide(
      Layer.mergeAll(XAttemptRepository.layer, XPublicationRepository.layer).pipe(
        Layer.provide(auth.database),
      ),
    ),
    Layer.provide(Layer.succeed(VerificationClient, sdk)),
    Layer.provide(provider),
    Layer.provide(NodeCrypto.layer),
    Layer.provideMerge(auth.auth),
    Layer.provideMerge(config),
  );
  const web = HttpRouter.toWebHandler(
    XRoutes.pipe(Layer.provide(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  const request = (
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string; method?: "GET" | "POST" } = {},
  ) =>
    web.handler(
      new Request(`http://localhost:8080/verification/x/${path}`, {
        method: options.method ?? (options.body ? "POST" : "GET"),
        headers: {
          "content-type": "application/json",
          origin: options.origin ?? auth.origin,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
    );
  return {
    auth,
    ...web,
    request,
    rpc,
    records,
    identity,
    failure,
    post,
    creations: () => creations,
    deletions: () => deletions,
  };
}
