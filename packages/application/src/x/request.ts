import { Effect, Schema } from "effect";

import { XError } from "@ens-social-verification/protocol/errors";

export const requestJson = Effect.fn("X.requestJson")(function* (url: string, init?: RequestInit) {
  return yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        headers: {
          accept: "application/json",
          "user-agent": "ens-social-verification",
          ...init?.headers,
        },
      });
      if (response.status === 404) {
        await response.body?.cancel();
        throw new XError({
          code: "INVALID_PROOF",
          message: "X account or post is no longer public",
        });
      }
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after")))
      ) {
        await response.body?.cancel();
        throw new XError({
          code: "UNAVAILABLE",
          reason: "rate_limit",
          message:
            "X's API rate limit was reached. Wait before checking again; no ENS transaction is needed.",
        });
      }
      if (response.status === 402) {
        await response.body?.cancel();
        throw new XError({
          code: "UNAVAILABLE",
          reason: "billing",
          message:
            "X API billing is not enabled or credits are exhausted. No ENS transaction is needed.",
        });
      }
      if (response.status === 204) return undefined;
      if ([400, 401, 403].includes(response.status)) {
        await response.body?.cancel();
        throw new XError({
          code: "UNAVAILABLE",
          reason:
            response.status === 403
              ? "api_access"
              : response.status === 401
                ? "credentials"
                : "token_exchange",
          message:
            response.status === 403
              ? "X denied API access. Check the app's project enrollment, API access and permissions."
              : response.status === 401
                ? "X rejected the configured credentials or access token."
                : "X rejected the request. Start a fresh connection and check the callback configuration.",
        });
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("X request failed");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          // eslint-disable-next-line no-await-in-loop -- Bound the response while reading the stream sequentially.
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 128 * 1024) throw new Error("X response too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    },
    catch: (error) =>
      Schema.is(XError)(error)
        ? error
        : new XError({
            code: "UNAVAILABLE",
            reason: "upstream",
            message: "X could not be reached. Please try again.",
          }),
  });
});
