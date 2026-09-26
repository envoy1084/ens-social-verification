import { Schema } from "effect";

export class EmailError extends Schema.TaggedError<EmailError>()("EmailError", {
  code: Schema.Literals(["INVALID_ATTEMPT", "INVALID_PROOF", "FORBIDDEN", "UNAVAILABLE"]),
  message: Schema.String,
}) {}
