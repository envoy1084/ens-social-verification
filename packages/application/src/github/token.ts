import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Context, Effect, Layer, Redacted } from "effect";

import { GithubError } from "@ens-social-verification/protocol/errors";

import { GithubConfig } from "./config.js";

const make = Effect.gen(function* () {
  const config = yield* GithubConfig;
  return {
    encrypt: (id: string, token: string) =>
      Effect.try({
        try: () => {
          const iv = randomBytes(12);
          const cipher = createCipheriv(
            "aes-256-gcm",
            Buffer.from(Redacted.value(config.tokenEncryptionKey), "hex"),
            iv,
          );
          cipher.setAAD(Buffer.from(id));
          const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
          return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
        },
        catch: () =>
          new GithubError({
            code: "UNAVAILABLE",
            message: "Unable to secure GitHub authorization",
          }),
      }),
    decrypt: (id: string, encrypted: string) =>
      Effect.try({
        try: () => {
          const bytes = Buffer.from(encrypted, "base64url");
          const decipher = createDecipheriv(
            "aes-256-gcm",
            Buffer.from(Redacted.value(config.tokenEncryptionKey), "hex"),
            bytes.subarray(0, 12),
          );
          decipher.setAAD(Buffer.from(id));
          decipher.setAuthTag(bytes.subarray(12, 28));
          return Redacted.make(
            Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
          );
        },
        catch: () =>
          new GithubError({
            code: "INVALID_ATTEMPT",
            message: "GitHub authorization expired. Connect again.",
          }),
      }),
  };
});

export class GithubTokens extends Context.Service<GithubTokens, Effect.Success<typeof make>>()(
  "application/GithubTokens",
) {
  static readonly layer = Layer.effect(GithubTokens, make);
}
