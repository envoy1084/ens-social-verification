import { Effect, Layer, Redacted } from "effect";

import { XConfig, XProvider, XTokens } from "@ens-social-verification/application";
import { createVerificationClaim, xMethod, xProofPost } from "@ens-social-verification/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

const config = Layer.succeed(XConfig, {
  clientId: "test-client",
  clientSecret: Redacted.make("test-secret"),
  apiToken: Redacted.make("public-read-token"),
  redirectUri: "http://localhost:8080/verification/x/callback",
  tokenEncryptionKey: Redacted.make("12".repeat(32)),
  proofOrigin: "https://api.example.test",
  enabled: true,
});
afterEach(() => vi.unstubAllGlobals());

describe("X proof and provider boundaries", () => {
  it("binds the short post commitment to the entire claim", async () => {
    const claim = await Effect.runPromise(
      createVerificationClaim({
        name: "alice.eth",
        authority: "0x1111111111111111111111111111111111111111",
        recordKey: "com.twitter",
        value: "alice",
        method: xMethod,
        target: "x:user:123:proof:attempt",
        issuedAt: "1",
        validUntil: "2",
      }),
    );
    expect(xProofPost(claim).length).toBeLessThan(280);
    expect(xProofPost({ ...claim, name: "bob.eth" })).not.toBe(xProofPost(claim));
    expect(xProofPost({ ...claim, target: "x:user:456:proof:attempt" })).not.toBe(
      xProofPost(claim),
    );
  });
  it("keeps public-read credentials separate from user writes and validates OAuth scopes", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* XProvider;
        fetchMock.mockResolvedValueOnce(
          Response.json({ data: { id: "123", username: "Alice", protected: false } }),
        );
        expect(yield* provider.lookup("123")).toEqual({ id: "123", login: "alice" });
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
          authorization: "Bearer public-read-token",
        });
        fetchMock.mockResolvedValueOnce(
          Response.json({ data: { id: "123", username: "Alice", protected: true } }),
        );
        expect((yield* provider.lookup("123").pipe(Effect.flip)).code).toBe("INVALID_PROOF");
        fetchMock.mockResolvedValueOnce(
          Response.json({
            access_token: "user-token",
            token_type: "bearer",
            scope: "users.read tweet.read",
            expires_in: 7200,
          }),
        );
        expect((yield* provider.exchange("code", "verifier").pipe(Effect.flip)).code).toBe(
          "INVALID_ATTEMPT",
        );
        fetchMock.mockResolvedValueOnce(Response.json({ data: { id: "456", text: "proof text" } }));
        expect(yield* provider.createPost(Redacted.make("user-token"), "proof text")).toBe("456");
        expect(fetchMock.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
          authorization: "Bearer user-token",
        });
        expect(fetchMock.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ text: "proof text" }));
        fetchMock.mockResolvedValueOnce(Response.json({ data: { deleted: true } }));
        yield* provider.deletePost("456", Redacted.make("user-token"));
        expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("DELETE");
        expect(fetchMock.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
          authorization: "Bearer user-token",
        });
      }).pipe(Effect.provide(XProvider.layer.pipe(Layer.provide(config)))),
    );
  });
  it("normalizes post edit history and rejects missing or conflicting histories", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* XProvider;
        for (const field of ["edit_history_tweet_ids", "edit_history_post_ids"]) {
          fetchMock.mockResolvedValueOnce(
            Response.json({
              data: {
                id: "123",
                author_id: "456",
                text: "proof",
                [field]: ["123"],
              },
            }),
          );
          expect((yield* provider.readPost("123")).editHistoryIds).toEqual(["123"]);
        }
        for (const history of [
          {},
          { edit_history_tweet_ids: ["123"], edit_history_post_ids: ["789"] },
        ]) {
          fetchMock.mockResolvedValueOnce(
            Response.json({
              data: {
                id: "123",
                author_id: "456",
                text: "proof",
                ...history,
              },
            }),
          );
          expect((yield* provider.readPost("123").pipe(Effect.flip)).code).toBe("INVALID_PROOF");
        }
      }).pipe(Effect.provide(XProvider.layer.pipe(Layer.provide(config)))),
    );
  });
  it.each([400, 401, 402, 403, 429])(
    "reports billing/rate-limit failures without leaking credentials (%s)",
    async (status) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ detail: "secret" }, { status }));
      vi.stubGlobal("fetch", fetchMock);
      await Effect.runPromise(
        Effect.gen(function* () {
          const provider = yield* XProvider;
          const error = yield* provider.readPost("123").pipe(Effect.flip);
          expect(error.code).toBe("UNAVAILABLE");
          expect(error.reason).toBe(
            {
              400: "token_exchange",
              401: "credentials",
              402: "billing",
              403: "api_access",
              429: "rate_limit",
            }[status],
          );
          expect(error.message).not.toContain("secret");
        }).pipe(Effect.provide(XProvider.layer.pipe(Layer.provide(config)))),
      );
    },
  );
  it("binds encrypted user tokens to the attempt", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const tokens = yield* XTokens;
        const encrypted = yield* tokens.encrypt("attempt-a", "user-token");
        expect(Redacted.value(yield* tokens.decrypt("attempt-a", encrypted))).toBe("user-token");
        expect(yield* tokens.decrypt("attempt-b", encrypted).pipe(Effect.isFailure)).toBe(true);
      }).pipe(Effect.provide(XTokens.layer.pipe(Layer.provide(config)))),
    );
  });
});
