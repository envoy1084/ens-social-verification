import { Schema } from "effect";

import { CredentialHash, SepoliaChainId, EthereumAddress } from "../../schema/index.js";

export const SessionInsert = Schema.Struct({
  id: Schema.String,
  tokenHash: CredentialHash,
  walletAddress: EthereumAddress,
  chainId: SepoliaChainId,
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});

export const Session = Schema.Struct({
  ...SessionInsert.fields,
  revokedAt: Schema.NullOr(Schema.Date),
});

export type Session = typeof Session.Type;
export type SessionInsert = typeof SessionInsert.Type;
