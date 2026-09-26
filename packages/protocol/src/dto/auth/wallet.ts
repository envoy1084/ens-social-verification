import { Schema } from "effect";

import {
  AuthNonce,
  SepoliaChainId,
  SiweMessage,
  EthereumAddress,
  EthereumSignature,
} from "../../schema/index.js";

export const AuthNonceResponse = Schema.Struct({ nonce: AuthNonce });
export const AuthMessageRequest = Schema.Struct({
  address: EthereumAddress,
  chainId: SepoliaChainId,
  nonce: AuthNonce,
});
export const AuthMessageResponse = Schema.Struct({ message: SiweMessage });
export const AuthVerifyRequest = Schema.Struct({
  message: SiweMessage,
  signature: EthereumSignature,
});
