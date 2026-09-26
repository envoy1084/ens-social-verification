import { Context, Effect, Layer, Redacted, Result } from "effect";

import { emailSubject } from "@ens-social-verification/protocol";
import { EmailError } from "@ens-social-verification/protocol/errors";
import type { EmailIntent, VerificationClaim } from "@ens-social-verification/protocol/schema";
import { Resend } from "resend";

import { EmailConfig } from "./config.js";
import { verifyEmailDkim } from "./dkim.js";

const make = Effect.gen(function* () {
  const config = yield* EmailConfig;
  const resend = config.enabled ? new Resend(Redacted.value(config.apiKey)) : null;
  return {
    receive: Effect.fn("EmailProvider.receive")(function* (
      intent: EmailIntent,
      claim: VerificationClaim,
    ) {
      if (!resend)
        return yield* new EmailError({
          code: "UNAVAILABLE",
          message: "Email verification is not configured.",
        });
      let after: string | undefined;
      let reason: string | null = null;
      let candidates = 0;
      // Bounded pagination: report a busy inbox instead of silently treating an incomplete scan as no match.
      for (let page = 0; page < 10; page++) {
        if (page > 0) yield* Effect.sleep("600 millis");
        const listing = yield* Effect.tryPromise({
          try: () => resend.emails.receiving.list({ limit: 100, ...(after ? { after } : {}) }),
          catch: () =>
            new EmailError({ code: "UNAVAILABLE", message: "Cannot reach the receiving inbox." }),
        });
        if (listing.error)
          return yield* new EmailError({
            code: "UNAVAILABLE",
            message: "Cannot read the receiving inbox. Check Resend access and retry.",
          });
        for (const message of listing.data.data) {
          if (message.subject !== emailSubject(claim) || !message.to.includes(intent.recipient))
            continue;
          if (++candidates > 5)
            return yield* new EmailError({
              code: "UNAVAILABLE",
              message: "Too many matching messages. Start a fresh email challenge.",
            });
          yield* Effect.sleep("600 millis");
          const received = yield* Effect.tryPromise({
            try: () => resend.emails.receiving.get(message.id, { html_format: "cid" }),
            catch: () =>
              new EmailError({
                code: "UNAVAILABLE",
                message: "Cannot retrieve the received email.",
              }),
          });
          if (received.error || !received.data.raw)
            return yield* new EmailError({
              code: "UNAVAILABLE",
              message: "Original email is not available yet. Try again shortly.",
            });
          const downloadUrl = received.data.raw.download_url;
          const raw = yield* Effect.tryPromise({
            try: async () => {
              const url = new URL(downloadUrl);
              if (
                url.protocol !== "https:" ||
                url.username ||
                url.password ||
                url.port ||
                !(url.hostname.endsWith(".resend.com") || url.hostname.endsWith(".amazonaws.com"))
              )
                throw new Error("Unsupported download host");
              const response = await fetch(url, {
                redirect: "error",
                signal: AbortSignal.timeout(10_000),
              });
              if (!response.ok || !response.body) throw new Error("Download failed");
              const reader = response.body.getReader();
              const chunks: Uint8Array[] = [];
              let size = 0;
              try {
                while (true) {
                  // Stream sequentially so the size cap applies before buffering the next chunk.
                  // eslint-disable-next-line no-await-in-loop
                  const next = await reader.read();
                  if (next.done) break;
                  size += next.value.length;
                  if (size > 256_000) throw new Error("Email too large");
                  chunks.push(next.value);
                }
              } finally {
                await reader.cancel();
              }
              return Buffer.concat(chunks).toString("base64");
            },
            catch: () =>
              new EmailError({
                code: "UNAVAILABLE",
                message:
                  "Cannot download the original email. Send a short email without attachments.",
              }),
          });
          const evidence = { intent, rawEmail: raw };
          const checked = yield* verifyEmailDkim(evidence, claim).pipe(Effect.result);
          if (Result.isSuccess(checked)) return { evidence, reason: null };
          if (checked.failure.code === "UNAVAILABLE") return yield* checked.failure;
          reason = checked.failure.message;
        }
        const last = listing.data.data.at(-1);
        if (
          !listing.data.has_more ||
          !last ||
          Date.parse(last.created_at) < Number(intent.issuedAt) * 1000 - 60_000
        )
          return { evidence: null, reason };
        after = last.id;
      }
      return yield* new EmailError({
        code: "UNAVAILABLE",
        message: "Receiving inbox is too busy to scan. Retry with a fresh challenge.",
      });
    }),
  };
});

export class EmailProvider extends Context.Service<EmailProvider, Effect.Success<typeof make>>()(
  "application/EmailProvider",
) {
  static readonly layer = Layer.effect(EmailProvider, make);
}
