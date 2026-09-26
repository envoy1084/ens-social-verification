import { Clock, Effect } from "effect";

import { normalizeVerificationName } from "@ens-social-verification/protocol";
import { VerificationError } from "@ens-social-verification/protocol/errors";
import {
  permissionedRegistryV2InterfaceGetStateAbi,
  permissionedRegistryV2InterfaceGetSubregistryAbi,
  erc1155SingletonV2InterfaceAbi,
} from "@ensforge/contracts/v2";
import { labelhash } from "@ensforge/core";
import { isAddressEqual, zeroAddress } from "viem";

import { VerificationClient, verificationDeployment } from "./client.js";
import { assertVerificationSnapshot, type VerificationSnapshot } from "./snapshot.js";

export const resolveEnsV2Authority = Effect.fn("resolveEnsV2Authority")(function* (
  input: string,
  snapshot: VerificationSnapshot,
) {
  const name = yield* normalizeVerificationName(input);
  const sdk = yield* VerificationClient;
  if (
    sdk.config.chainId !== 11155111 ||
    sdk.config.deployments.protocol !== "v2" ||
    sdk.config.deployments.v1 !== undefined ||
    !isAddressEqual(
      sdk.config.deployments.v2.contracts.ethRegistry,
      verificationDeployment.contracts.ethRegistry,
    ) ||
    !isAddressEqual(
      sdk.config.deployments.v2.contracts.rootRegistry,
      verificationDeployment.contracts.rootRegistry,
    )
  ) {
    return yield* new VerificationError({
      code: "UNSUPPORTED_AUTHORITY",
      message: "Unsupported ENS deployment",
    });
  }
  yield* assertVerificationSnapshot(snapshot);
  const client = sdk.config.publicClient;
  const registry = yield* Effect.tryPromise({
    try: () =>
      client.readContract({
        address: verificationDeployment.contracts.rootRegistry,
        abi: permissionedRegistryV2InterfaceGetSubregistryAbi,
        functionName: "getSubregistry",
        args: ["eth"],
        blockNumber: snapshot.number,
      }),
    catch: () =>
      new VerificationError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Cannot read ENSv2 root route",
      }),
  });
  if (!isAddressEqual(registry, verificationDeployment.contracts.ethRegistry)) {
    return yield* new VerificationError({
      code: "UNSUPPORTED_AUTHORITY",
      message: "ENSv2 .eth route changed",
    });
  }
  const state = yield* Effect.tryPromise({
    try: () =>
      client.readContract({
        address: registry,
        abi: permissionedRegistryV2InterfaceGetStateAbi,
        functionName: "getState",
        args: [BigInt(labelhash(name.slice(0, -4)))],
        blockNumber: snapshot.number,
      }),
    catch: () =>
      new VerificationError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Cannot read ENSv2 registration",
      }),
  });
  const now = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));
  if (
    state.status !== 2 ||
    state.expiry <= snapshot.timestamp ||
    state.expiry <= now ||
    isAddressEqual(state.latestOwner, zeroAddress)
  ) {
    return yield* new VerificationError({
      code: "INACTIVE_AUTHORITY",
      message: "Name has no active ENSv2 registration",
    });
  }
  const owner = yield* Effect.tryPromise({
    try: () =>
      client.readContract({
        address: registry,
        abi: erc1155SingletonV2InterfaceAbi,
        functionName: "ownerOf",
        args: [state.tokenId],
        blockNumber: snapshot.number,
      }),
    catch: () =>
      new VerificationError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Cannot read ENSv2 token owner",
      }),
  });
  if (isAddressEqual(owner, zeroAddress) || !isAddressEqual(owner, state.latestOwner)) {
    return yield* new VerificationError({
      code: "INACTIVE_AUTHORITY",
      message: "No consistent active token owner",
    });
  }
  yield* assertVerificationSnapshot(snapshot);
  return {
    name,
    authority: owner,
    authorityValidUntil: state.expiry,
    registry,
    tokenId: state.tokenId,
    snapshot,
  };
});
