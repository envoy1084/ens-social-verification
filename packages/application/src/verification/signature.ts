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
  if (!code || code === "0x") {
    const recovered = yield* Effect.tryPromise({
      try: () => recoverAddress({ hash, signature }),
      catch: () =>
        new VerificationError({ code: "INVALID_SIGNATURE", message: "Invalid EOA signature" }),
    });
    if (!isAddressEqual(recovered, authority)) {
      return yield* new VerificationError({
        code: "INVALID_SIGNATURE",
        message: "Signature does not match authority",
      });
    }
  } else {
    if (code.toLowerCase().startsWith("0xef0100")) {
      return yield* new VerificationError({
        code: "UNSUPPORTED_AUTHORITY",
        message: "Delegated-code accounts are not supported in this profile",
      });
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
  }
  yield* assertVerificationSnapshot(snapshot);
});
