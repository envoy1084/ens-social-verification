import { Context, Effect, Layer } from "effect";

import { AuthUnavailable, InvalidSignature } from "@ens-social-verification/protocol/errors";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  hashMessage,
  recoverMessageAddress,
} from "viem";
import type { Address, Hex, PublicClient } from "viem";

export interface SepoliaClientService {
  readonly getCode: PublicClient["getCode"];
  readonly readContract: PublicClient["readContract"];
}

export class SepoliaClient extends Context.Service<SepoliaClient, SepoliaClientService>()(
  "application/SepoliaClient",
) {}

const make = Effect.gen(function* () {
  const client = yield* SepoliaClient;

  return {
    verify: Effect.fn("SignatureVerifier.verify")(function* (
      address: Address,
      message: string,
      signature: Hex,
    ) {
      const code = yield* Effect.tryPromise({
        try: () => client.getCode({ address }),
        catch: () => new AuthUnavailable(),
      });

      const delegated = code !== undefined && /^0xef0100[0-9a-f]{40}$/i.test(code);
      if (!code || code === "0x" || delegated) {
        const recovered = yield* Effect.tryPromise({
          try: () => recoverMessageAddress({ message, signature }),
          catch: () => new InvalidSignature(),
        }).pipe(Effect.catchTag("InvalidSignature", () => Effect.succeed(null)));

        if (recovered?.toLowerCase() === address.toLowerCase()) return;

        if (!delegated) return yield* new InvalidSignature();
      }

      const result = yield* Effect.tryPromise({
        try: () =>
          client.readContract({
            address,
            abi: [
              {
                type: "function",
                name: "isValidSignature",
                stateMutability: "view",
                inputs: [
                  { name: "hash", type: "bytes32" },
                  { name: "signature", type: "bytes" },
                ],
                outputs: [{ type: "bytes4" }],
              },
            ],
            functionName: "isValidSignature",
            args: [hashMessage(message), signature],
          }),
        catch: (error) => {
          const rejected =
            error instanceof BaseError
              ? error.walk(
                  (cause) =>
                    cause instanceof ContractFunctionRevertedError ||
                    cause instanceof ContractFunctionZeroDataError,
                )
              : undefined;

          return rejected instanceof ContractFunctionRevertedError ||
            rejected instanceof ContractFunctionZeroDataError
            ? new InvalidSignature()
            : new AuthUnavailable();
        },
      });

      if (result !== "0x1626ba7e") return yield* new InvalidSignature();
    }),
  };
});

export class SignatureVerifier extends Context.Service<
  SignatureVerifier,
  Effect.Success<typeof make>
>()("application/SignatureVerifier") {
  static readonly layer = Layer.effect(SignatureVerifier, make);
}
