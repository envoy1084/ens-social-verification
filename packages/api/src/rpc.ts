import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";

export const RpcRequest = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([Schema.String, Schema.Finite, Schema.Null]),
  method: Schema.Literals([
    "eth_chainId",
    "eth_blockNumber",
    "eth_call",
    "eth_getBalance",
    "eth_getCode",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getTransactionCount",
    "eth_getTransactionReceipt",
    "eth_getTransactionByHash",
    "eth_estimateGas",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_feeHistory",
    "net_version",
  ]),
  params: Schema.optionalKey(Schema.Array(Schema.Unknown)),
});

export const RpcPayload = Schema.Union([
  RpcRequest,
  Schema.Array(RpcRequest).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
]);

export const RpcApi = HttpApiGroup.make("rpc").add(
  HttpApiEndpoint.post("forward", "/rpc/:chainId", {
    params: { chainId: Schema.Literals(["1", "11155111"]) },
    payload: RpcPayload,
    success: Schema.Unknown,
    error: [
      Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
      Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(413)),
      Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(415)),
      Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(429)),
      Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(502)),
      Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(503)),
    ],
  }).annotate(
    OpenApi.Description,
    "Read-only Alchemy JSON-RPC proxy. Ethereum and Sepolia; up to 20 requests per batch. Upstream JSON-RPC errors preserve their response envelope.",
  ),
);
