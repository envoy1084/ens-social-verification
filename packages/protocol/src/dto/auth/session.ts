import { Schema } from "effect";

import { SepoliaChainId, EthereumAddress } from "../../schema/index.js";

export const AuthSession = Schema.Struct({
  address: EthereumAddress,
  chainId: SepoliaChainId,
  expiresAt: Schema.String,
});
