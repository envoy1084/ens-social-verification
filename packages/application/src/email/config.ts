import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

import { EmailAddress } from "@ens-social-verification/protocol/schema";

const make = Effect.gen(function* () {
  const apiKey = yield* Config.Redacted("RESEND_API_KEY").pipe(
    Config.withDefault(Redacted.make("")),
  );
  const recipient = yield* Config.String("EMAIL_VERIFICATION_RECIPIENT").pipe(
    Config.withDefault(""),
  );
  const proofOrigin = yield* Config.String("PUBLIC_SERVER_URL");
  const origin = yield* Effect.try(() => new URL(proofOrigin));
  if (origin.origin !== proofOrigin || origin.protocol !== "https:")
    return yield* Effect.fail(new Error("PUBLIC_SERVER_URL must be an HTTPS origin"));
  if (recipient) yield* Schema.decodeUnknownEffect(EmailAddress)(recipient);
  return { apiKey, recipient, proofOrigin, enabled: Boolean(recipient && Redacted.value(apiKey)) };
});

export class EmailConfig extends Context.Service<EmailConfig, Effect.Success<typeof make>>()(
  "application/EmailConfig",
) {
  static readonly layer = Layer.effect(EmailConfig, make);
}
