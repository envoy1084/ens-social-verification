import { Context, Effect, Layer, Schema } from "effect";

import { farcasterNonce } from "@ens-social-verification/protocol";
import { FarcasterError } from "@ens-social-verification/protocol/errors";
import {
  FarcasterFid,
  type FarcasterIntent,
  type VerificationSignature,
} from "@ens-social-verification/protocol/schema";
import { type AppClient } from "@farcaster/auth-client";

export class FarcasterAuthClient extends Context.Service<FarcasterAuthClient, AppClient>()(
  "application/FarcasterAuthClient",
) {}

const make = Effect.gen(function* () {
  const client = yield* FarcasterAuthClient;
  return {
    verify: Effect.fn("FarcasterProvider.verify")(function* (
      intent: FarcasterIntent,
      message: string,
      signature: typeof VerificationSignature.Type,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          client.verifySignInMessage({
            domain: intent.domain,
            nonce: farcasterNonce(intent),
            message,
            signature,
            acceptAuthAddress: true,
          }),
        catch: () =>
          new FarcasterError({
            code: "UNAVAILABLE",
            message: "Farcaster identity verification is unavailable. Try again.",
          }),
      }).pipe(
        Effect.timeout("15 seconds"),
        Effect.mapError(
          () =>
            new FarcasterError({
              code: "UNAVAILABLE",
              message: "Farcaster identity verification timed out or failed. Try again.",
            }),
        ),
      );
      if (result.isError)
        return yield* new FarcasterError({
          code:
            result.error?.errCode === "unavailable" || result.error?.errCode === "unknown"
              ? "UNAVAILABLE"
              : "INVALID_PROOF",
          message: "Farcaster signature or signer authorization could not be verified.",
        });
      const issuedAt = result.data.issuedAt?.getTime();
      if (
        !result.success ||
        result.data.uri !== intent.uri ||
        result.data.requestId !== intent.id ||
        result.data.expirationTime?.getTime() !== Number(intent.validUntil) * 1000 ||
        !issuedAt ||
        issuedAt < Number(intent.issuedAt) * 1000 - 300_000 ||
        issuedAt >= Number(intent.validUntil) * 1000
      )
        return yield* new FarcasterError({
          code: "INVALID_PROOF",
          message: "Farcaster approval does not match this verification request.",
        });
      return yield* Schema.decodeUnknownEffect(FarcasterFid)(result.fid).pipe(
        Effect.mapError(
          () =>
            new FarcasterError({ code: "INVALID_PROOF", message: "Invalid Farcaster identity." }),
        ),
      );
    }),
    verifyUsername: Effect.fn("FarcasterProvider.verifyUsername")(function* (
      username: string,
      fid: number,
    ) {
      if (username === `fid:${fid}`) return;
      const payload = yield* Effect.tryPromise({
        try: async (signal) => {
          const response = await fetch(
            `https://fnames.farcaster.xyz/transfers/current?name=${encodeURIComponent(username)}`,
            { signal, redirect: "error" },
          );
          if (response.status === 404) {
            await response.body?.cancel();
            return null;
          }
          if (!response.ok || !response.body) {
            await response.body?.cancel();
            throw new Error("Fname unavailable");
          }
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              // Stream reads must remain sequential to enforce the response size limit.
              // eslint-disable-next-line no-await-in-loop
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > 16_384) throw new Error("Fname response too large");
              chunks.push(chunk.value);
            }
          } finally {
            await reader.cancel();
          }
          return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        },
        catch: () =>
          new FarcasterError({
            code: "UNAVAILABLE",
            message: "Farcaster username lookup is unavailable. Try again.",
          }),
      }).pipe(
        Effect.timeout("10 seconds"),
        Effect.mapError(
          () =>
            new FarcasterError({
              code: "UNAVAILABLE",
              message: "Farcaster username lookup is unavailable. Try again.",
            }),
        ),
      );
      const transfer = yield* Schema.decodeUnknownEffect(
        Schema.NullOr(
          Schema.Struct({
            transfer: Schema.Struct({ username: Schema.String, to: Schema.Number }),
          }),
        ),
      )(payload).pipe(
        Effect.mapError(
          () =>
            new FarcasterError({
              code: "UNAVAILABLE",
              message: "Unexpected Farcaster username response.",
            }),
        ),
      );
      if (transfer?.transfer.username !== username || transfer.transfer.to !== fid)
        return yield* new FarcasterError({
          code: "INVALID_PROOF",
          message: "The Farcaster username changed or belongs to another account.",
        });
    }),
  };
});

export class FarcasterProvider extends Context.Service<
  FarcasterProvider,
  Effect.Success<typeof make>
>()("application/FarcasterProvider") {
  static readonly layer = Layer.effect(FarcasterProvider, make);
}
