import { Effect, Schema } from "effect";

import {
  hashVerificationClaim,
  validateVerificationClaim,
} from "@ens-social-verification/protocol";
import { VerificationError } from "@ens-social-verification/protocol/errors";
import { VerificationSignature } from "@ens-social-verification/protocol/schema";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  isAddressEqual,
  parseAbi,
  recoverAddress,
} from "viem";
import type { Address } from "viem";

import { VerificationClient } from "./client.js";
import { assertVerificationSnapshot, type VerificationSnapshot } from "./snapshot.js";

const signatureAbi = parseAbi([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);

export const verifyAuthoritySignature = Effect.fn("verifyAuthoritySignature")(function* (
  input: unknown,
  signatureInput: unknown,
  authority: Address,
  snapshot: VerificationSnapshot,
) {
  const claim = yield* validateVerificationClaim(input);
  const signature = yield* Schema.decodeUnknownEffect(VerificationSignature)(signatureInput).pipe(
    Effect.mapError(
      () =>
        new VerificationError({
          code: "INVALID_SIGNATURE",
          message: "Malformed authority signature",
        }),
    ),
  );
  if (!isAddressEqual(claim.authority, authority)) {
    return yield* new VerificationError({
      code: "INVALID_SIGNATURE",
      message: "Claim authority does not match current owner",
    });
  }
  const sdk = yield* VerificationClient;
  const client = sdk.config.publicClient;
  const code = yield* Effect.tryPromise({
    try: () => client.getCode({ address: authority, blockNumber: snapshot.number }),
    catch: () =>
      new VerificationError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Cannot read authority code",
      }),
  });
  const hash = hashVerificationClaim(claim);
  const delegated = code !== undefined && /^0xef0100[0-9a-f]{40}$/i.test(code);
  if (!code || code === "0x" || delegated) {
    const recovered = yield* Effect.tryPromise({
      try: () => recoverAddress({ hash, signature }),
      catch: () =>
        new VerificationError({ code: "INVALID_SIGNATURE", message: "Invalid EOA signature" }),
    }).pipe(Effect.catchTag("VerificationError", () => Effect.succeed(null)));
    // Delegation preserves the account's own key; custom signatures use its ERC-1271 code.
    if (recovered && isAddressEqual(recovered, authority)) {
      yield* assertVerificationSnapshot(snapshot);
      return;
    }
    if (!delegated) {
      return yield* new VerificationError({
        code: "INVALID_SIGNATURE",
        message: "Signature does not match authority",
      });
    }
  }

  const magic = yield* Effect.tryPromise({
    try: () =>
      client.readContract({
        address: authority,
        abi: signatureAbi,
        functionName: "isValidSignature",
        args: [hash, signature],
        blockNumber: snapshot.number,
      }),
    catch: (error) => {
      const rejected =
        error instanceof BaseError &&
        error.walk(
          (cause) =>
            cause instanceof ContractFunctionRevertedError ||
            cause instanceof ContractFunctionZeroDataError,
        );
      return new VerificationError({
        code:
          rejected instanceof ContractFunctionRevertedError ||
          rejected instanceof ContractFunctionZeroDataError
            ? "INVALID_SIGNATURE"
            : "DEPENDENCY_UNAVAILABLE",
        message: "Contract authority signature could not be validated",
      });
    },
  });
  if (magic !== "0x1626ba7e") {
    return yield* new VerificationError({
      code: "INVALID_SIGNATURE",
      message: "Contract authority rejected signature",
    });
  }
  yield* assertVerificationSnapshot(snapshot);
});
