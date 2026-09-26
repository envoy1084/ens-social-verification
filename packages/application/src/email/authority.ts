import { Context, Effect, Layer } from "effect";

import { EmailError } from "@ens-social-verification/protocol/errors";
import type { EthereumAddress } from "@ens-social-verification/protocol/schema";
import { isAddressEqual } from "viem";

import { resolveEnsV2Authority } from "../verification/authority.js";
import { VerificationClient } from "../verification/client.js";
import { createVerificationSnapshot } from "../verification/snapshot.js";

const make = Effect.gen(function* () {
  const client = yield* VerificationClient;
  return {
    check: Effect.fn("EmailAuthority.check")(
      function* (name: string, wallet: EthereumAddress) {
        const snapshot = yield* createVerificationSnapshot();
        const authority = yield* resolveEnsV2Authority(name, snapshot);
        if (!isAddressEqual(authority.authority, wallet))
          return yield* new EmailError({
            code: "FORBIDDEN",
            message: "Connect the wallet that owns this name.",
          });
        return authority;
      },
      Effect.provideService(VerificationClient, client),
    ),
  };
});

export class EmailAuthority extends Context.Service<EmailAuthority, Effect.Success<typeof make>>()(
  "application/EmailAuthority",
) {
  static readonly layer = Layer.effect(EmailAuthority, make);
}
