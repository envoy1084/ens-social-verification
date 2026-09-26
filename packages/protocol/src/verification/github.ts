import { Effect, Schema } from "effect";

import { GithubError } from "../errors/github.js";
import { GithubEnvelope } from "../schema/github.js";

export const githubMethod = "github.gist.v1";
export const githubRecordKey = "com.github";
export const githubProofFilename = "ens-verification.json";

export function serializeGithubEnvelope(envelope: GithubEnvelope) {
  return JSON.stringify(envelope, null, 2);
}

export const decodeGithubEnvelope = Effect.fn("decodeGithubEnvelope")(function* (content: string) {
  if (new TextEncoder().encode(content).byteLength > 64 * 1024)
    return yield* new GithubError({ code: "INVALID_PROOF", message: "GitHub proof is too large" });
  const envelope = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(GithubEnvelope))(
    content,
    { onExcessProperty: "error" },
  ).pipe(
    Effect.mapError(
      () => new GithubError({ code: "INVALID_PROOF", message: "Invalid GitHub proof document" }),
    ),
  );
  // This method uses one canonical JSON encoding, rejecting duplicate members and ambiguous encodings.
  if (serializeGithubEnvelope(envelope) !== content)
    return yield* new GithubError({
      code: "INVALID_PROOF",
      message: "GitHub proof is not in canonical form",
    });
  return envelope;
});

export const parseGithubGistUri = Effect.fn("parseGithubGistUri")(function* (uri: string) {
  const match =
    /^https:\/\/gist\.github\.com\/([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/([0-9a-f]{20,32})$/.exec(
      uri,
    );
  if (!match?.[1] || !match[2])
    return yield* new GithubError({
      code: "INVALID_PROOF",
      message: "Expected a public github.com gist URL",
    });
  return { login: match[1], id: match[2] };
});
