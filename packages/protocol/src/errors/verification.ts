import { Schema } from "effect";

export class VerificationError extends Schema.TaggedError<VerificationError>()(
  "VerificationError",
  {
    code: Schema.Literals([
      "INVALID_DESCRIPTOR",
      "UNSUPPORTED_AUTHORITY",
      "UNSUPPORTED_METHOD",
      "INVALID_CLAIM",
      "INVALID_SIGNATURE",
      "INACTIVE_AUTHORITY",
      "RECORD_MISMATCH",
      "STALE_SNAPSHOT",
      "DEPENDENCY_UNAVAILABLE",
    ]),
    message: Schema.String,
  },
) {}
