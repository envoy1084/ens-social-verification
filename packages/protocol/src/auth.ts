import { Schema } from "effect";

export const AuthNonce = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const AuthMessageRequest = Schema.Struct({
  address: Schema.String.check(Schema.isPattern(/^0x[a-fA-F0-9]{40}$/)),
  chainId: Schema.Literal(11155111),
  nonce: AuthNonce,
});
export const AuthVerifyRequest = Schema.Struct({
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048)),
  signature: Schema.String.check(
    Schema.isPattern(/^0x(?:[a-fA-F0-9]{2})+$/),
    Schema.isMaxLength(8194),
  ),
});
export const AuthSession = Schema.Struct({
  address: Schema.String,
  chainId: Schema.Literal(11155111),
  expiresAt: Schema.String,
});

export class InvalidChallenge extends Schema.TaggedError<InvalidChallenge>()(
  "InvalidChallenge",
  {},
) {}
export class InvalidSignature extends Schema.TaggedError<InvalidSignature>()(
  "InvalidSignature",
  {},
) {}
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", {}) {}
export class AuthUnavailable extends Schema.TaggedError<AuthUnavailable>()("AuthUnavailable", {}) {}
