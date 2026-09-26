import { Schema } from "effect";

export class XError extends Schema.TaggedError<XError>()("XError", {
  code: Schema.Literals(["INVALID_ATTEMPT", "FORBIDDEN", "UNAVAILABLE", "INVALID_PROOF"]),
  message: Schema.String,
}) {}
