import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi";

import { RpcPayload } from "./rpc.js";

export { RpcPayload, RpcRequest } from "./rpc.js";

const error = (status: number) =>
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(status));

const health = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("live", "/health", {
    success: Schema.Struct({ status: Schema.Literal("ok") }),
  }),
  HttpApiEndpoint.get("ready", "/health/ready", {
    success: Schema.Struct({ status: Schema.Literal("ready") }),
    error: error(503),
  }).annotate(OpenApi.Description, "Configuration readiness; does not probe Alchemy."),
);

const rpc = HttpApiGroup.make("rpc").add(
  HttpApiEndpoint.post("forward", "/rpc/:chainId", {
    params: { chainId: Schema.Literals(["1", "11155111"]) },
    payload: RpcPayload,
    success: Schema.Unknown,
    error: [error(400), error(413), error(415), error(429), error(502), error(503)],
  }).annotate(
    OpenApi.Description,
    "Read-only Alchemy JSON-RPC proxy. Ethereum and Sepolia; up to 20 requests per batch. Upstream JSON-RPC errors preserve their response envelope.",
  ),
);

export class Api extends HttpApi.make("ens-social")
  .add(health, rpc)
  .annotateMerge(OpenApi.annotations({ title: "ENS Social Verification API", version: "0.1.0" })) {}
