import { Effect, Schema } from "effect";

import type { SponsorshipRpcRequest } from "@ens-social-verification/protocol/schema";
import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { isAddressEqual, type Address, type Hex } from "viem";

import { resolveEnsV2Authority } from "../verification/authority.js";
import { VerificationClient } from "../verification/client.js";
import {
  assertVerificationSnapshot,
  createVerificationSnapshot,
} from "../verification/snapshot.js";
import { validateSponsoredCalls } from "./calls.js";
import { verifyHcaAtSnapshot } from "./hca-cache.js";
import { createSponsorshipValidationCache } from "./validation-cache.js";

const validationCaches = new WeakMap<object, ReturnType<typeof createSponsorshipValidationCache>>();

const quantity = Schema.String.check(Schema.isPattern(/^0x(?:0|[1-9a-f][0-9a-f]*)$/i));
const bytes = Schema.String.check(Schema.isPattern(/^0x(?:[0-9a-f]{2})*$/i));
const address = Schema.String.check(Schema.isPattern(/^0x[0-9a-f]{40}$/i));
const operation = Schema.Struct({
  sender: address,
  nonce: quantity,
  callData: bytes,
  signature: Schema.optionalKey(bytes),
  callGasLimit: Schema.optionalKey(quantity),
  verificationGasLimit: Schema.optionalKey(quantity),
  preVerificationGas: Schema.optionalKey(quantity),
  maxFeePerGas: Schema.optionalKey(quantity),
  maxPriorityFeePerGas: Schema.optionalKey(quantity),
  paymaster: Schema.optionalKey(address),
  paymasterData: Schema.optionalKey(bytes),
  paymasterVerificationGasLimit: Schema.optionalKey(quantity),
  paymasterPostOpGasLimit: Schema.optionalKey(quantity),
});

export const validateSponsorshipRequest = Effect.fn("validateSponsorshipRequest")(function* (
  request: typeof SponsorshipRpcRequest.Type,
  name: string,
  owner: Address,
) {
  const { method, params } = request;
  if (
    ["eth_chainId", "eth_supportedEntryPoints", "pimlico_getUserOperationGasPrice"].includes(method)
  ) {
    if (params.length) return yield* Effect.fail(new Error("Unexpected parameters"));
    return;
  }
  if (method === "eth_getUserOperationReceipt") {
    if (
      params.length !== 1 ||
      typeof params[0] !== "string" ||
      !/^0x[0-9a-f]{64}$/i.test(params[0])
    )
      return yield* Effect.fail(new Error("Invalid operation hash"));
    return;
  }
  const paymaster = method.startsWith("pm_");
  if (
    params.length !== (paymaster ? 4 : 2) ||
    typeof params[1] !== "string" ||
    params[1].toLowerCase() !== sepoliaHcaDeployment.infrastructure.entryPoint.toLowerCase() ||
    (paymaster && params[2] !== "0xaa36a7")
  )
    return yield* Effect.fail(new Error("Unsupported EntryPoint or chain"));
  const op = yield* Schema.decodeUnknownEffect(operation)(params[0], { onExcessProperty: "error" });
  if (method === "eth_sendUserOperation" && (!op.signature || !op.paymaster))
    return yield* Effect.fail(new Error("Expected a signed sponsored operation"));
  for (const field of [
    "callGasLimit",
    "verificationGasLimit",
    "preVerificationGas",
    "paymasterVerificationGasLimit",
    "paymasterPostOpGasLimit",
  ] as const) {
    if (BigInt(op[field] ?? "0x0") > 2_000_000n)
      return yield* Effect.fail(new Error("Gas limit exceeded"));
  }
  if (
    BigInt(op.maxFeePerGas ?? "0x0") > 100_000_000_000n ||
    BigInt(op.maxPriorityFeePerGas ?? "0x0") > 100_000_000_000n
  )
    return yield* Effect.fail(new Error("Fee limit exceeded"));
  const sdk = yield* VerificationClient;
  const snapshot = yield* createVerificationSnapshot();
  let cache = validationCaches.get(sdk);
  if (!cache) {
    cache = createSponsorshipValidationCache();
    validationCaches.set(sdk, cache);
  }
  const identity = {
    snapshot,
    name,
    owner,
    sender: op.sender,
    nonce: op.nonce,
    callData: op.callData,
  };
  if (cache.has(identity)) {
    yield* assertVerificationSnapshot(snapshot);
    return;
  }
  const authority = yield* resolveEnsV2Authority(name, snapshot);
  if (!isAddressEqual(authority.authority, owner))
    return yield* Effect.fail(new Error("Not the name owner"));
  yield* Effect.tryPromise(async () => {
    const hca = op.sender as Address;
    // verifyHca already checks canonical derivation, salt, owner and implementation.
    const [account, resolver] = await Promise.all([
      verifyHcaAtSnapshot(sdk.hca.verifyHca, snapshot, hca, owner),
      sdk.resolution.getResolver({ name, blockNumber: snapshot.number }),
    ]);
    if (account.deployed === false) throw new Error("Deploy HCA first");
    if (!resolver) throw new Error("Missing resolver");
    const records = validateSponsoredCalls(op.callData as Hex, name, resolver);
    const permissions = await sdk.capabilities.getRecordPermissions({
      name,
      account: hca,
      records,
      blockNumber: snapshot.number,
    });
    if (
      permissions.records.length !== records.length ||
      !permissions.records.every((record) => record.authorization.status === "authorized")
    )
      throw new Error("HCA is not authorized");
  });
  yield* assertVerificationSnapshot(snapshot);
  cache.remember(identity, authority.authorityValidUntil);
});
