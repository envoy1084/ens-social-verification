import { Effect, Redacted } from "effect";

import { OAuthConfig, OAuthProvider } from "@ens-social-verification/application";
import { afterEach, describe, expect, it, vi } from "vitest";

import { telegramFixture } from "../fixtures/telegram.js";

const telegram = telegramFixture();
const verifier = "a".repeat(43);
const config = {
  providers: {
    telegram: {
      clientId: "test-telegram",
      clientSecret: Redacted.make("telegram-secret"),
      redirectUri: "http://localhost:8080/verification/oauth/telegram/callback",
    },
  },
  proofOrigin: "https://api.example.com",
  signingKey: Redacted.make(""),
};
const exchange = () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* OAuthProvider;
      return yield* provider.exchange("telegram", "test-state", "test-code", verifier);
    }).pipe(Effect.provide(OAuthProvider.layer), Effect.provideService(OAuthConfig, config)),
  );

function mockToken(idToken: string | undefined) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://oauth.telegram.org/.well-known/jwks.json")
      return Response.json({ keys: [telegram.jwk] });
    if (url === "https://oauth.telegram.org/token") {
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      expect(authorization.startsWith("Basic ")).toBe(true);
      expect(decodeURIComponent(Buffer.from(authorization.slice(6), "base64").toString())).toBe(
        "test-telegram:telegram-secret",
      );
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("code_verifier")).toBe(verifier);
      expect(form.get("redirect_uri")).toBe(config.providers.telegram.redirectUri);
      return Response.json({
        access_token: "discard-this",
        token_type: "Bearer",
        id_token: idToken,
      });
    }
    throw new Error("Unexpected Telegram request");
  });
}
afterEach(() => vi.restoreAllMocks());

describe("Telegram OIDC validation", () => {
  it("verifies the Telegram signature and uses claims without requesting UserInfo", async () => {
    const transport = mockToken(telegram.token(telegram.nonce(verifier)));
    await expect(exchange()).resolves.toEqual({
      provider: "telegram",
      issuer: "https://oauth.telegram.org",
      subject: "123456789",
      value: "Alice",
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each([
    { iss: "https://evil.test" },
    { aud: "another-app" },
    { exp: 1 },
    { nonce: "wrong-nonce" },
    { nonce: undefined },
    { preferred_username: undefined },
  ])("rejects invalid or incomplete claims: %j", async (overrides) => {
    mockToken(telegram.token(telegram.nonce(verifier), overrides));
    await expect(exchange()).rejects.toThrow();
  });
  it("rejects a forged signature even when claims are otherwise valid", async () => {
    const forged = telegramFixture();
    mockToken(forged.token(telegram.nonce(verifier)));
    await expect(exchange()).rejects.toThrow();
  });
  it("does not fall back to OAuth when an ID token is missing", async () => {
    mockToken(undefined);
    await expect(exchange()).rejects.toThrow();
  });
  it("identifies a missing nonce without exposing token claims", async () => {
    mockToken(telegram.token(telegram.nonce(verifier), { nonce: undefined }));
    await expect(exchange()).rejects.toThrow("OIDC nonce is missing or mismatched");
  });
  it("reports rejected credentials without leaking the provider error description", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          error: "invalid_client",
          error_description: "private-secret-do-not-log",
        },
        { status: 401 },
      ),
    );
    await expect(exchange()).rejects.toThrow("OAuth client credentials were rejected.");
  });
});
