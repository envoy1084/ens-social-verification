import { Schema } from "effect";

export const RpcRequest = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([Schema.String, Schema.Number, Schema.Null]),
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
  params: Schema.optional(Schema.Array(Schema.Unknown)),
});

export const RpcPayload = Schema.Union([
  RpcRequest,
  Schema.Array(RpcRequest).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
]);
