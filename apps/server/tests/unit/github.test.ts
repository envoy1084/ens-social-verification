import { Effect, Layer, Redacted } from "effect";

import { GithubConfig, GithubTokens } from "@ens-social-verification/application";
import {
  createVerificationClaim,
  decodeGithubEnvelope,
  parseGithubGistUri,
  serializeGithubEnvelope,
  githubMethod,
} from "@ens-social-verification/protocol";
import { describe, expect, it } from "vitest";

describe("signed GitHub gist boundaries", () => {
  it("rejects duplicate JSON members, unknown fields and oversized documents", async () => {
    const claim = await Effect.runPromise(
      createVerificationClaim({
        name: "alice.eth",
        authority: "0x1111111111111111111111111111111111111111",
        method: githubMethod,
        recordKey: "com.github",
        value: "alice",
        target: "github:user:123",
        issuedAt: "1",
        validUntil: "2",
      }),
    );
    const envelope = {
      v: "ensrv1" as const,
      claim,
      authoritySignature: "0x1234" as const,
      proof: { githubId: "1", login: "alice" },
    };
    const content = serializeGithubEnvelope(envelope);
    expect(await Effect.runPromise(decodeGithubEnvelope(content))).toEqual(envelope);
    await expect(
      Effect.runPromise(
        decodeGithubEnvelope(content.replace('"v": "ensrv1",', '"v": "ensrv1", "v": "ensrv1",')),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(decodeGithubEnvelope(JSON.stringify({ ...envelope, extra: true }))),
    ).rejects.toThrow();
    await expect(Effect.runPromise(decodeGithubEnvelope(" ".repeat(65537)))).rejects.toThrow();
  });
  it("restricts retrieval to canonical GitHub gist identifiers", async () => {
    const uri = `https://gist.github.com/alice/${"a".repeat(32)}`;
    expect(await Effect.runPromise(parseGithubGistUri(uri))).toEqual({
      login: "alice",
      id: "a".repeat(32),
    });
    await expect(Effect.runPromise(parseGithubGistUri(`${uri}?raw=1`))).rejects.toThrow();
    await expect(
      Effect.runPromise(
        parseGithubGistUri(uri.replace("gist.github.com", "gist.github.com.evil.test")),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(parseGithubGistUri("https://localhost/proof")),
    ).rejects.toThrow();
  });
  it("encrypts temporary OAuth tokens and binds ciphertext to the attempt", async () => {
    const config = Layer.succeed(GithubConfig, {
      clientId: "test",
      clientSecret: Redacted.make("test"),
      redirectUri: "http://localhost/callback",
      tokenEncryptionKey: Redacted.make("12".repeat(32)),
      enabled: true,
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        const tokens = yield* GithubTokens;
        const encrypted = yield* tokens.encrypt("attempt-a", "github-secret");
        expect(encrypted).not.toContain("github-secret");
        expect(Redacted.value(yield* tokens.decrypt("attempt-a", encrypted))).toBe("github-secret");
        expect(yield* tokens.decrypt("attempt-b", encrypted).pipe(Effect.isFailure)).toBe(true);
      }).pipe(Effect.provide(GithubTokens.layer.pipe(Layer.provide(config)))),
    );
  });
});
