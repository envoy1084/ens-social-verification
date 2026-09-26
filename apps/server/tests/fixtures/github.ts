import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";

import {
  GithubAuthority,
  GithubConfig,
  GithubOAuth,
  GithubProofs,
  GithubRemoval,
  GithubProvider,
  GithubTokens,
  VerificationClient,
} from "@ens-social-verification/application";
import {
  GithubAttemptRepository,
  GithubPublicationRepository,
} from "@ens-social-verification/database";
import { githubProofFilename, serializeGithubEnvelope } from "@ens-social-verification/protocol";
import { GithubError } from "@ens-social-verification/protocol/errors";
import type { Address } from "viem";

import { GithubRoutes } from "../../src/routes/github/index.js";
import { authFixture } from "./auth.js";
import { ensRecordFixture } from "./ens-records.js";

export function githubFixture(databaseUrl: string, owner: Address) {
  const auth = authFixture(databaseUrl);
  const { sdk, rpc, records } = ensRecordFixture(owner);
  const identity = { id: "123", login: "alice" };
  const gist = {
    id: "a".repeat(32),
    public: true as const,
    owner: { id: 123, login: "alice", type: "User" as const },
    files: {
      [githubProofFilename]: {
        filename: githubProofFilename,
        content: "",
        truncated: false,
        size: 0,
      },
    },
  };
  let creations = 0;
  let deletions = 0;
  const provider = Layer.succeed(GithubProvider, {
    deleteGist: () =>
      Effect.sync(() => {
        deletions++;
      }),
    exchange: () => Effect.succeed({ identity, token: Redacted.make("test-github-token") }),
    currentUser: () => Effect.succeed(identity),
    lookup: () => Effect.succeed(identity),
    createGist: (_token, envelope) =>
      Effect.sync(() => {
        creations++;
        gist.files[githubProofFilename].content = serializeGithubEnvelope(envelope);
        gist.files[githubProofFilename].size = gist.files[githubProofFilename].content.length;
        return gist;
      }),
    readGist: (id) =>
      id === gist.id
        ? Effect.succeed(gist)
        : Effect.fail(new GithubError({ code: "INVALID_PROOF", message: "Gist missing" })),
  });
  const config = Layer.succeed(GithubConfig, {
    enabled: true,
    clientId: "test",
    clientSecret: Redacted.make("secret"),
    redirectUri: "http://localhost:8080/verification/github/callback",
    tokenEncryptionKey: Redacted.make("34".repeat(32)),
    apiToken: Redacted.make(""),
  });
  const services = Layer.merge(GithubProofs.layer, GithubRemoval.layer).pipe(
    Layer.provideMerge(GithubOAuth.layer),
    Layer.provide(Layer.mergeAll(GithubAuthority.layer, GithubTokens.layer)),
    Layer.provide(
      Layer.mergeAll(GithubAttemptRepository.layer, GithubPublicationRepository.layer).pipe(
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
    GithubRoutes.pipe(Layer.provide(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  const request = (
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string; method?: "GET" | "POST" } = {},
  ) =>
    web.handler(
      new Request(`http://localhost:8080/verification/github/${path}`, {
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
    gist,
    creations: () => creations,
    deletions: () => deletions,
  };
}
