import { Clock, Effect } from "effect";

import { VerificationError } from "@ens-social-verification/protocol/errors";

import { VerificationClient } from "./client.js";

export interface VerificationSnapshot {
  readonly number: bigint;
  readonly hash: `0x${string}`;
  readonly timestamp: bigint;
}

export const createVerificationSnapshot = Effect.fn("createVerificationSnapshot")(function* () {
  const sdk = yield* VerificationClient;
  const client = sdk.config.publicClient;
  const chainId = yield* Effect.tryPromise({
    try: () => client.getChainId(),
    catch: () =>
      new VerificationError({ code: "DEPENDENCY_UNAVAILABLE", message: "Cannot read RPC chain" }),
  });
  if (chainId !== 11155111) {
    return yield* new VerificationError({
      code: "UNSUPPORTED_AUTHORITY",
      message: "Verification requires Sepolia",
    });
  }
  const block = yield* Effect.tryPromise({
    try: () => client.getBlock({ blockTag: "latest" }),
    catch: () =>
      new VerificationError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Cannot read evaluation block",
      }),
  });
  if (block.number === null || block.hash === null) {
    return yield* new VerificationError({
      code: "STALE_SNAPSHOT",
      message: "Pending evaluation block",
    });
  }
  const snapshot = { number: block.number, hash: block.hash, timestamp: block.timestamp };
  yield* assertVerificationSnapshot(snapshot);
  return snapshot;
});

export const assertVerificationSnapshot = Effect.fn("assertVerificationSnapshot")(function* (
  snapshot: VerificationSnapshot,
) {
  const sdk = yield* VerificationClient;
  const now = BigInt(Math.floor((yield* Clock.currentTimeMillis) / 1000));
  if (snapshot.timestamp > now + 30n || now - snapshot.timestamp > 300n) {
    return yield* new VerificationError({
      code: "STALE_SNAPSHOT",
      message: "Evaluation block is outside the freshness window",
    });
  }
  const block = yield* Effect.tryPromise({
    try: () => sdk.config.publicClient.getBlock({ blockNumber: snapshot.number }),
    catch: () =>
      new VerificationError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Cannot confirm evaluation block",
      }),
  });
  if (block.hash !== snapshot.hash || block.timestamp !== snapshot.timestamp) {
    return yield* new VerificationError({
      code: "STALE_SNAPSHOT",
      message: "Evaluation block changed; retry verification",
    });
  }
});
