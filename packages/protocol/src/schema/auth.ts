import { Schema } from "effect";

import { Hex } from "./evm.js";

export const AuthNonce = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const CredentialHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const SiweMessage = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048));
export const EthereumSignature = Hex.check(
  Schema.isPattern(/^0x(?:[a-fA-F0-9]{2})+$/),
  Schema.isMaxLength(8194),
);
