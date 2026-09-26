import { Schema } from "effect";

export class GithubError extends Schema.TaggedError<GithubError>()("GithubError", {
  code: Schema.Literals(["INVALID_ATTEMPT", "FORBIDDEN", "UNAVAILABLE", "INVALID_PROOF"]),
  message: Schema.String,
}) {}
