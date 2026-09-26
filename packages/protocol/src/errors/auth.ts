import { Schema } from "effect";

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
