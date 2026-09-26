import { ByteSize, Clock, Effect, Exit, Layer, Redacted, Result, Schema } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpIncomingMessage,
  HttpRouter,
  HttpServerResponse,
} from "effect/unstable/http";
import { OpenApi } from "effect/unstable/httpapi";

import { Api, RpcPayload } from "@ens-social/api";

import { ServerConfig } from "./config.js";
const alchemyNetworks: Readonly<Record<string, string>> = {
  "1": "eth-mainnet",
  "11155111": "eth-sepolia",
};
const openApi = OpenApi.fromApi(Api);

const failure = (status: number, message: string) =>
  HttpServerResponse.jsonUnsafe(
    { error: message },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );

export const Routes = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const client = yield* HttpClient.HttpClient;
    let windowStart = 0;
    let requests = 0;
    let active = 0;

    const health = HttpRouter.add(
      "GET",
      "/health",
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          { status: "ok" },
          { headers: { "cache-control": "no-store" } },
        ),
      ),
    );
    const ready = HttpRouter.add(
      "GET",
      "/health/ready",
      Effect.sync(() =>
        Redacted.value(config.alchemyKey).trim()
          ? HttpServerResponse.jsonUnsafe(
              { status: "ready" },
              { headers: { "cache-control": "no-store" } },
            )
          : failure(503, "Alchemy is not configured"),
      ),
    );
    const rpc = HttpRouter.add("POST", "/rpc/:chainId", (request) =>
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
        if (now - windowStart >= 60_000) {
          windowStart = now;
          requests = 0;
        }
        if (requests >= 120 || active >= 10) return failure(429, "RPC request limit reached");
        requests++;
        active++;

        return yield* Effect.gen(function* () {
          const body = yield* request.text.pipe(
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
    const spec = Effect.succeed(HttpServerResponse.jsonUnsafe(openApi));
    return Layer.mergeAll(
      health,
      ready,
      rpc,
      HttpRouter.add("GET", "/", spec),
      HttpRouter.add("GET", "/openapi.json", spec),
    );
  }),
);
