import { Schema } from "effect";

import { CredentialHash, SiweMessage } from "../../schema/index.js";

export const AuthChallengeInsert = Schema.Struct({
  id: Schema.String,
  nonceHash: CredentialHash,
  browserTokenHash: CredentialHash,
  createdAt: Schema.Date,
  expiresAt: Schema.Date,
});

export const AuthChallenge = Schema.Struct({
  ...AuthChallengeInsert.fields,
  message: Schema.NullOr(SiweMessage),
  attempts: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  consumedAt: Schema.NullOr(Schema.Date),
});

export type AuthChallenge = typeof AuthChallenge.Type;
export type AuthChallengeInsert = typeof AuthChallengeInsert.Type;
