import { Schema } from "effect";

export class FarcasterError extends Schema.TaggedError<FarcasterError>()("FarcasterError", {
  code: Schema.Literals(["INVALID_ATTEMPT", "INVALID_PROOF", "FORBIDDEN", "UNAVAILABLE"]),
  message: Schema.String,
}) {}
