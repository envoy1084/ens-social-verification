import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";

import {
  OAuthAttestor,
  OAuthAuthority,
  OAuthConfig,
  OAuthConnection,
  OAuthProofs,
  OAuthProvider,
  VerificationClient,
} from "@ens-social-verification/application";
import {
  OAuthAttemptRepository,
  OAuthAttestationRepository,
} from "@ens-social-verification/database";
import type { Address, Hex } from "viem";

import { OAuthRoutes } from "../../src/routes/oauth/index.js";
import { authFixture } from "./auth.js";
import { ensRecordFixture } from "./ens-records.js";

export function oauthFixture(databaseUrl: string, owner: Address, signingKey: Hex) {
  const auth = authFixture(databaseUrl);
  const ens = ensRecordFixture(owner);
  const services = OAuthProofs.layer.pipe(
    Layer.provideMerge(OAuthConnection.layer),
    Layer.provide(Layer.mergeAll(OAuthAuthority.layer, OAuthProvider.layer, OAuthAttestor.layer)),
    Layer.provide(
      Layer.mergeAll(OAuthAttemptRepository.layer, OAuthAttestationRepository.layer).pipe(
        Layer.provide(auth.database),
      ),
    ),
    Layer.provide(Layer.succeed(VerificationClient, ens.sdk)),
    Layer.provide(NodeCrypto.layer),
    Layer.provideMerge(auth.auth),
    Layer.provide(
      Layer.succeed(OAuthConfig, {
        providers: {
          discord: {
            clientId: "test-client",
            clientSecret: Redacted.make("test-secret"),
            redirectUri: "http://localhost:8080/verification/oauth/discord/callback",
          },
          telegram: {
            clientId: "test-telegram",
            clientSecret: Redacted.make("telegram-secret"),
            redirectUri: "http://localhost:8080/verification/oauth/telegram/callback",
          },
        },
        proofOrigin: "https://api.example.com",
        signingKey: Redacted.make(signingKey),
      }),
    ),
  );
  const web = HttpRouter.toWebHandler(
    OAuthRoutes.pipe(Layer.provide(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  const request = (
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string } = {},
  ) =>
    web.handler(
      new Request(`http://localhost:8080/verification/oauth/${path}`, {
        method: options.body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          origin: options.origin ?? auth.origin,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
    );
  return { ...web, ...ens, auth, request };
}
