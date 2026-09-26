import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";

import {
  EmailAuthority,
  EmailConfig,
  EmailConnection,
  EmailProofs,
  EmailProvider,
  VerificationClient,
} from "@ens-social-verification/application";
import { EmailAttemptRepository } from "@ens-social-verification/database";
import type { Address } from "viem";

import { EmailRoutes } from "../../src/routes/email/index.js";
import { authFixture } from "./auth.js";
import { ensRecordFixture } from "./ens-records.js";

export function emailFixture(databaseUrl: string, owner: Address) {
  const auth = authFixture(databaseUrl);
  const ens = ensRecordFixture(owner);
  const services = EmailProofs.layer.pipe(
    Layer.provideMerge(EmailConnection.layer),
    Layer.provide(Layer.mergeAll(EmailAuthority.layer, EmailProvider.layer)),
    Layer.provide(EmailAttemptRepository.layer.pipe(Layer.provide(auth.database))),
    Layer.provide(Layer.succeed(VerificationClient, ens.sdk)),
    Layer.provide(NodeCrypto.layer),
    Layer.provideMerge(auth.auth),
    Layer.provide(
      Layer.succeed(EmailConfig, {
        proofOrigin: "https://api.example.com",
        apiKey: Redacted.make("test-only"),
        recipient: "verify@proof.example.com",
        enabled: true,
      }),
    ),
  );
  const web = HttpRouter.toWebHandler(
    EmailRoutes.pipe(Layer.provide(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  const request = (
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string } = {},
  ) =>
    web.handler(
      new Request(`http://localhost:8080/verification/email/${path}`, {
        method: options.body ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          origin: options.origin ?? auth.origin,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
    );
  return { ...web, auth, ...ens, request };
}
