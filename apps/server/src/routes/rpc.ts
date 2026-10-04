import { ByteSize, Clock, Effect, Exit, Layer, Redacted, Result, Schema, Stream } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpIncomingMessage,
  HttpRouter,
  HttpServerResponse,
} from "effect/http";

import { RpcPayload } from "@ens-social-verification/api";

import { ServerConfig } from "../config.js";
const alchemyNetworks: Readonly<Record<string, string>> = {
  "11155111": "eth-sepolia",
};

const failure = (status: number, message: string, retryAfter?: number) =>
  HttpServerResponse.jsonUnsafe(
    { error: message },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(retryAfter === undefined ? {} : { "retry-after": String(retryAfter) }),
      },
    },
  );

export const RpcRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const client = yield* HttpClient.HttpClient;
    let lastRefill = 0;
    let tokens = 240;
    let active = 0;

    return HttpRouter.add("POST", "/rpc/:chainId", (request) =>
      Effect.gen(function* () {
        const { chainId = "" } = yield* HttpRouter.params;
        const network = Object.hasOwn(alchemyNetworks, chainId)
          ? alchemyNetworks[chainId]
          : undefined;
        if (!network) return failure(400, "Unsupported chain");
        const key = Redacted.value(config.alchemyKey).trim();
        if (!key) return failure(503, "Alchemy is not configured");
        if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
          return failure(415, "Expected application/json");
        }
        const now = yield* Clock.currentTimeMillis;
        // Allow a full HCA execution burst while retaining 120/minute sustained throughput.
        tokens = Math.min(240, tokens + Math.max(0, now - lastRefill) / 500);
        lastRefill = now;
        if (tokens < 1) return failure(429, "RPC request limit reached", 1);
        if (active >= 10) return failure(429, "RPC request limit reached", 1);
        tokens--;
        active++;

        return yield* Effect.gen(function* () {
          const body = yield* request.stream.pipe(
            Stream.runFoldEffect(
              () => ({ chunks: [] as Uint8Array[], bytes: 0 }),
              (state, chunk) => {
                const bytes = state.bytes + chunk.byteLength;
                if (bytes > 64 * 1024) return Effect.fail("RequestTooLarge" as const);
                state.chunks.push(chunk);
                return Effect.succeed({ chunks: state.chunks, bytes });
              },
            ),
            Effect.map(({ chunks }) => Buffer.concat(chunks).toString("utf8")),
            Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.kibibytes(64)),
            Effect.timeout("10 seconds"),
            Effect.result,
          );
          if (Result.isFailure(body)) return failure(413, "Request body unavailable or too large");
          const decoded = Schema.decodeUnknownExit(Schema.fromJsonString(RpcPayload))(body.success);
          if (Exit.isFailure(decoded))
            return failure(400, "Invalid or unsupported JSON-RPC request");

          const upstream = yield* client
            .execute(
              HttpClientRequest.post(
                `https://${network}.g.alchemy.com/v2/${encodeURIComponent(key)}`,
              ).pipe(HttpClientRequest.bodyText(body.success, "application/json")),
            )
            .pipe(
              Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
              Effect.flatMap((response) =>
                Effect.map(response.arrayBuffer, (bytes) => ({
                  status: response.status,
                  bytes: new Uint8Array(bytes),
                })),
              ),
              Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.mebibytes(2)),
              Effect.timeout("20 seconds"),
              Effect.result,
            );
          if (Result.isFailure(upstream)) return failure(502, "RPC upstream unavailable");
          if (upstream.success.bytes.byteLength > 2 * 1024 * 1024)
            return failure(502, "RPC upstream response too large");
          if (
            upstream.success.status >= 300 &&
            upstream.success.status < 500 &&
            upstream.success.status !== 429
          ) {
            return failure(502, "RPC upstream rejected the request");
          }
          return HttpServerResponse.uint8Array(upstream.success.bytes, {
            status: upstream.success.status,
            contentType: "application/json",
            headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
          });
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              active--;
            }),
          ),
        );
      }),
    );
  }),
);
