import { Context, Effect, Layer } from "effect";

import { XError } from "@ens-social-verification/protocol/errors";
import type { EthereumAddress } from "@ens-social-verification/protocol/schema";
import { isAddressEqual } from "viem";

import { resolveEnsV2Authority } from "../verification/authority.js";
import { VerificationClient } from "../verification/client.js";
import { createVerificationSnapshot } from "../verification/snapshot.js";

const make = Effect.gen(function* () {
  const client = yield* VerificationClient;
  return {
    check: Effect.fn("XAuthority.check")(
      function* (name: string, wallet: EthereumAddress) {
        const snapshot = yield* createVerificationSnapshot();
        const authority = yield* resolveEnsV2Authority(name, snapshot);
        if (!isAddressEqual(authority.authority, wallet))
          return yield* new XError({
            code: "FORBIDDEN",
            message: "Connect the wallet that owns this ENSv2 name",
          });
        return authority;
      },
      Effect.provideService(VerificationClient, client),
    ),
  };
});

export class XAuthority extends Context.Service<XAuthority, Effect.Success<typeof make>>()(
  "application/XAuthority",
) {
  static readonly layer = Layer.effect(XAuthority, make);
}
