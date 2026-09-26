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

function mockToken(idToken: string | undefined, tokenFields: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://oauth.telegram.org/.well-known/jwks.json")
      return Response.json({ keys: [telegram.jwk] });
    if (url === "https://oauth.telegram.org/token") {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("client_id")).toBe(config.providers.telegram.clientId);
      expect(form.get("client_secret")).toBe(
        Redacted.value(config.providers.telegram.clientSecret),
      );
      expect(form.get("grant_type")).toBe("authorization_code");
      expect(form.get("code")).toBe("test-code");
      expect(form.get("code_verifier")).toBe(verifier);
      expect(form.get("redirect_uri")).toBe(config.providers.telegram.redirectUri);
      return Response.json({
        access_token: "discard-this",
        token_type: "Bearer",
        id_token: idToken,
        ...tokenFields,
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
  it.each([
    ["access_token", 123],
    ["token_type", undefined],
    ["id_token", ""],
    ["scope", ["openid", "private-provider-value"]],
    ["expires_in", -1],
  ])(
    "identifies malformed HTTP 200 token field %s without leaking values",
    async (field, value) => {
      mockToken(telegram.token(telegram.nonce(verifier)), { [field]: value });
      try {
        await exchange();
        expect.fail("Expected exchange failure");
      } catch (error) {
        expect(String(error)).toContain(`OAuth token response`);
        expect(String(error)).toContain(field);
        expect(String(error)).toContain("HTTP=200; code=OAUTH_INVALID_RESPONSE");
        expect(String(error)).not.toContain("discard-this");
        expect(String(error)).not.toContain("private-provider-value");
      }
    },
  );
  it("identifies invalid ID-token claim types without leaking the token", async () => {
    const token = telegram.token(telegram.nonce(verifier), { aud: 123456 });
    mockToken(token);
    try {
      await exchange();
      expect.fail("Expected exchange failure");
    } catch (error) {
      expect(String(error)).toContain("OIDC ID token claim aud has an invalid type.");
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain("123456");
    }
  });
  it.each([undefined, "", null])(
    "accepts a signed ID-token-only response with access_token=%s",
    async (accessToken) => {
      const transport = mockToken(telegram.token(telegram.nonce(verifier)), {
        access_token: accessToken,
        token_type: accessToken,
      });
      await expect(exchange()).resolves.toMatchObject({ provider: "telegram", value: "Alice" });
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    { iss: "https://evil.test" },
    { aud: "another-app" },
    { exp: 1 },
    { nonce: "wrong-nonce" },
    { nonce: undefined },
  ])("rejects invalid claims even without an access token: %j", async (overrides) => {
    mockToken(telegram.token(telegram.nonce(verifier), overrides), {
      access_token: "",
      token_type: "",
    });
    await expect(exchange()).rejects.toThrow();
  });
  it("rejects an ID-token-only response with a forged signature", async () => {
    mockToken(telegramFixture().token(telegram.nonce(verifier)), { access_token: "" });
    await expect(exchange()).rejects.toThrow("signature failed verification");
  });
  it("rejects an empty token response instead of inventing an identity", async () => {
    mockToken(undefined, { access_token: "", token_type: undefined });
    await expect(exchange()).rejects.toThrow(
      "telegram-envelope=unchanged;access_token:empty,id_token:missing,token_type:missing,error:missing",
    );
  });
  it("reports nested response field types without exposing their contents", async () => {
    mockToken(undefined, {
      access_token: null,
      data: { id_token: "private-jwt", access_token: "private-access", email: "private-email" },
      result: { error: "private-error" },
      unexpected: "private-value",
    });
    try {
      await exchange();
      expect.fail("Expected exchange failure");
    } catch (error) {
      expect(String(error)).toContain("access_token:null,id_token:missing");
      expect(String(error)).toContain("data:object{access_token:string,id_token:string");
      expect(String(error)).toContain(
        "result:object{access_token:missing,id_token:missing,token_type:missing,error:string}",
      );
      expect(String(error)).not.toContain("private-");
      expect(String(error)).not.toContain("email");
      expect(String(error)).not.toContain("unexpected");
    }
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
  it.each([
    ["invalid_client", "OAuth client credentials were rejected"],
    ["invalid_grant", "OAuth code exchange was rejected"],
    ["invalid_request", "OAuth token request was rejected as malformed"],
    ["private-unknown-error", "OAuth provider rejected the token request"],
  ])("reports a Telegram HTTP 200 error: %s", async (code, message) => {
    const transport = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        error: code,
        error_description: "private-provider-details",
        id_token: "private-token",
      }),
    );
    try {
      await exchange();
      expect.fail("Expected exchange failure");
    } catch (error) {
      expect(String(error)).toContain(message);
      expect(String(error)).toContain("HTTP=200");
      expect(String(error)).toContain(
        `provider-error:${code.startsWith("private") ? "unrecognized" : code}`,
      );
      expect(String(error)).not.toContain("private-");
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("identifies a rejected signing algorithm", async () => {
    const token = telegram.token(telegram.nonce(verifier)).split(".");
    token[0] = Buffer.from(JSON.stringify({ alg: "ES256", kid: "telegram-test" })).toString(
      "base64url",
    );
    mockToken(token.join("."));
    await expect(exchange()).rejects.toThrow("OIDC signing algorithm mismatch");
  });
  it("reports HTTP status without exposing a provider response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("private-provider-body", { status: 502 }),
    );
    await expect(exchange()).rejects.toThrow(
      "endpoint=token; HTTP=502; code=OAUTH_RESPONSE_IS_NOT_CONFORM",
    );
  });
  it("reports network failure codes without exposing URLs or credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("private-url-with-secret", {
        cause: Object.assign(new Error("private-details"), { code: "ENOTFOUND" }),
      }),
    );
    try {
      await exchange();
      expect.fail("Expected exchange failure");
    } catch (error) {
      expect(String(error)).toContain("HTTP=no response; code=TypeError, ENOTFOUND");
      expect(String(error)).not.toContain("private-");
    }
  });
});
