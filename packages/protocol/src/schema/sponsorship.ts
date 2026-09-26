import { Schema } from "effect";

export const sponsoredRecordKeys = [
  "com.github",
  "com.twitter",
  "xyz.farcaster",
  "email",
  "com.discord",
  "org.telegram",
] as const;

export const sponsoredRecords = sponsoredRecordKeys.flatMap((key) => [
  { type: "text" as const, key },
  { type: "text" as const, key: `verification[text][${key}]` },
]);

export const SponsorshipRpcRequest = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([Schema.String, Schema.Finite]),
  method: Schema.Literals([
    "eth_chainId",
    "eth_supportedEntryPoints",
    "pimlico_getUserOperationGasPrice",
    "pm_getPaymasterStubData",
    "pm_getPaymasterData",
    "eth_estimateUserOperationGas",
    "eth_sendUserOperation",
    "eth_getUserOperationReceipt",
  ]),
  params: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(4)),
});
