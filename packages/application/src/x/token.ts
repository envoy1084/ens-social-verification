import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Context, Effect, Layer, Redacted } from "effect";

import { XError } from "@ens-social-verification/protocol/errors";

import { XConfig } from "./config.js";

const make = Effect.gen(function* () {
  const config = yield* XConfig;
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
          new XError({
            code: "UNAVAILABLE",
            message: "Unable to secure X authorization",
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
          new XError({
            code: "INVALID_ATTEMPT",
            message: "X authorization expired. Connect again.",
          }),
      }),
  };
});

export class XTokens extends Context.Service<XTokens, Effect.Success<typeof make>>()(
  "application/XTokens",
) {
  static readonly layer = Layer.effect(XTokens, make);
}
