import { Schema } from "effect";

export class OAuthError extends Schema.TaggedError<OAuthError>()("OAuthError", {
  code: Schema.Literals(["INVALID_ATTEMPT", "INVALID_PROOF", "FORBIDDEN", "UNAVAILABLE"]),
  message: Schema.String,
}) {}
