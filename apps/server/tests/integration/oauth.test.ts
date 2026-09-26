import { Effect, Schema } from "effect";

import { Database, oauthAttempts } from "@ens-social-verification/database";
import { getVerificationTypedData } from "@ens-social-verification/protocol";
import {
  OAuthAttemptResponse,
  OAuthPublication,
  OAuthStartResponse,
} from "@ens-social-verification/protocol/dto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { responseCookie } from "../fixtures/auth.js";
import { oauthFixture } from "../fixtures/oauth.js";
import { telegramFixture } from "../fixtures/telegram.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("DATABASE_URL must end in _test");
const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const app = oauthFixture(databaseUrl, owner.address, generatePrivateKey());
const telegram = telegramFixture();
let cookie = "";
let tokenExchanges = 0;
let grantedScope = "identify";

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.href === "https://oauth.telegram.org/.well-known/jwks.json")
      return Response.json({ keys: [telegram.jwk] });
    if (url.href === "https://oauth.telegram.org/token") {
      const form = new URLSearchParams(String(init?.body));
      return Response.json({
        access_token: "test-telegram-access",
        token_type: "Bearer",
        id_token: telegram.token(telegram.nonce(form.get("code_verifier") ?? "")),
      });
    }
    if (url.href === "https://discord.com/api/oauth2/token") {
      tokenExchanges++;
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("grant_type")).toBe("authorization_code");
      expect(form.get("code_verifier")).toMatch(/^[a-zA-Z0-9_-]{43}$/);
      expect(form.get("client_id")).toBe("test-client");
      expect(form.get("client_secret")).toBe("test-secret");
      expect(form.get("redirect_uri")).toBe(
        "http://localhost:8080/verification/oauth/discord/callback",
      );
      return Response.json({
        access_token: "test-access",
        token_type: "Bearer",
        expires_in: 3600,
        scope: grantedScope,
      });
    }
    if (url.href === "https://discord.com/api/v10/users/@me") {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-access");
      return Response.json({ id: "123456789", username: "alice" });
    }
    throw new Error("Unexpected OAuth transport request");
  });
});
beforeAll(async () => {
  const nonce = await app.auth.request("nonce");
  const binding = responseCookie(nonce, "ens-challenge=");
  const body = (await nonce.json()) as { nonce: string };
  const response = await app.auth.request("message", {
    cookie: binding,
    body: { address: owner.address, chainId: 11155111, nonce: body.nonce },
  });
  const { message } = (await response.json()) as { message: string };
  cookie = responseCookie(
    await app.auth.request("verify", {
      cookie: binding,
      body: { message, signature: await owner.signMessage({ message }) },
    }),
    "ens-session=",
  );
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app.dispose();
  await app.auth.dispose();
  await app.auth.runtime.dispose();
});

async function start(provider = "discord") {
  const response = await app.request(`${provider}/start`, { cookie, body: { name: "alice.eth" } });
  expect(response.status).toBe(200);
  const pending = Schema.decodeUnknownSync(OAuthStartResponse)(await response.json());
  const url = new URL(pending.authorizeUrl);
  expect(url.origin).toBe(
    provider === "telegram" ? "https://oauth.telegram.org" : "https://discord.com",
  );
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("scope")).toBe(
    provider === "telegram" ? "openid profile" : "identify",
  );
  if (provider === "telegram")
    expect(url.searchParams.get("nonce")).toBe(
      telegram.nonce(responseCookie(response, "ens-oauth=").slice("ens-oauth=".length)),
    );
  return {
    ...pending,
    cookies: `${cookie}; ${responseCookie(response, "ens-oauth=")}`,
    callback: `${provider}/callback?${new URLSearchParams({ state: url.searchParams.get("state") ?? "", code: "test-code" })}`,
  };
}

describe("generic OAuth identity attestations", () => {
  it("publishes and revokes Telegram attestations without mixing provider identities", async () => {
    const pending = await start("telegram");
    const mixed = await app.request(pending.callback.replace("telegram/", "discord/"), {
      cookie: pending.cookies,
    });
    expect(mixed.headers.get("location")).toContain("error=authorization");
    const callback = await app.request(pending.callback, { cookie: pending.cookies });
    expect(callback.headers.get("location")).toContain(`oauthAttempt=${pending.id}`);
    const ready = Schema.decodeUnknownSync(OAuthAttemptResponse)(
      await (await app.request(`attempts/${pending.id}`, { cookie })).json(),
    );
    expect(ready.identity).toMatchObject({ provider: "telegram", value: "Alice" });
    if (!ready.claim) throw new Error("Expected Telegram claim");
    expect(ready.claim.recordKey).toBe("org.telegram");
    const publication = Schema.decodeUnknownSync(OAuthPublication)(
      await (
        await app.request(`attempts/${pending.id}/publish`, {
          cookie,
          body: {
            authoritySignature: await owner.signTypedData(getVerificationTypedData(ready.claim)),
          },
        })
      ).json(),
    );
    app.records["org.telegram"] = publication.value;
    app.records["verification[text][org.telegram]"] = publication.descriptor;
    expect(await (await app.request("telegram/status?name=alice.eth")).json()).toMatchObject({
      status: "verified",
      value: "Alice",
    });
    const removal = { name: "alice.eth", proofUri: publication.proofUri };
    expect((await app.request("discord/removal", { cookie, body: removal })).status).toBe(403);
    expect((await app.request("telegram/removal", { cookie, body: removal })).status).toBe(400);
    app.records["org.telegram"] = "";
    app.records["verification[text][org.telegram]"] = "";
    expect(await (await app.request("telegram/removal", { cookie, body: removal })).json()).toEqual(
      { revoked: true },
    );
    expect((await app.request(`proofs/${pending.id}`)).status).toBe(400);
  });
  it("requires a same-origin wallet session and name authority", async () => {
    const body = { name: "alice.eth" };
    expect((await app.request("discord/start", { body })).status).toBe(401);
    expect(
      (await app.request("discord/start", { cookie, body, origin: "https://evil.test" })).status,
    ).toBe(403);
    app.rpc.owner = stranger.address;
    expect((await app.request("discord/start", { cookie, body })).status).toBe(403);
    app.rpc.owner = owner.address;
  });
  it("binds callbacks to PKCE and session, consumes once, and revokes after ENS removal", async () => {
    const pending = await start();
    const exchangesBefore = tokenExchanges;
    expect((await app.request(pending.callback, { cookie })).headers.get("location")).toContain(
      "error=authorization",
    );
    expect(tokenExchanges).toBe(exchangesBefore);
    const callback = await app.request(pending.callback, { cookie: pending.cookies });
    expect(callback.headers.get("location")).toBe(
      `http://localhost:3000/alice.eth?oauthAttempt=${pending.id}`,
    );
    expect(
      (await app.request(pending.callback, { cookie: pending.cookies })).headers.get("location"),
    ).toContain("error=authorization");
    expect(tokenExchanges).toBe(exchangesBefore + 1);
    const path = `attempts/${pending.id}`;
    expect((await app.request(path)).status).toBe(401);
    const ready = Schema.decodeUnknownSync(OAuthAttemptResponse)(
      await (await app.request(path, { cookie })).json(),
    );
    expect(ready.identity).toMatchObject({
      provider: "discord",
      subject: "123456789",
      value: "alice",
    });
    if (!ready.claim) throw new Error("Expected ready claim");
    expect(
      (
        await app.request(`${path}/publish`, {
          cookie,
          body: {
            authoritySignature: await stranger.signTypedData(getVerificationTypedData(ready.claim)),
          },
        })
      ).status,
    ).toBe(400);
    const body = {
      authoritySignature: await owner.signTypedData(getVerificationTypedData(ready.claim)),
    };
    const responses = await Promise.all([
      app.request(`${path}/publish`, { cookie, body }),
      app.request(`${path}/publish`, { cookie, body }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const publication = Schema.decodeUnknownSync(OAuthPublication)(await responses[0].json());
    expect(await responses[1].json()).toEqual(publication);
    const proof = await (await app.request(`proofs/${pending.id}`)).text();
    expect(proof).not.toContain("test-access");
    expect(proof).not.toContain("sessionHash");
    app.records["com.discord"] = "alice";
    app.records["verification[text][com.discord]"] = publication.descriptor;
    expect(await (await app.request("discord/status?name=alice.eth")).json()).toMatchObject({
      status: "verified",
      value: "alice",
    });
    app.rpc.owner = stranger.address;
    expect(await (await app.request("discord/status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.rpc.owner = owner.address;
    const removal = { name: "alice.eth", proofUri: publication.proofUri };
    expect((await app.request("discord/removal", { cookie, body: removal })).status).toBe(400);
    app.records["com.discord"] = "";
    expect((await app.request("discord/removal", { cookie, body: removal })).status).toBe(400);
    app.records["verification[text][com.discord]"] = "";
    expect(await (await app.request("discord/removal", { cookie, body: removal })).json()).toEqual({
      revoked: true,
    });
    expect((await app.request(`proofs/${pending.id}`)).status).toBe(400);
    expect((await app.request(`${path}/publish`, { cookie, body })).status).toBe(400);
    app.records["com.discord"] = "alice";
    app.records["verification[text][com.discord]"] = publication.descriptor;
    expect(await (await app.request("discord/status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
  });
  it("rejects missing scopes and expired attempts", async () => {
    const denied = await start();
    grantedScope = "";
    expect(
      (await app.request(denied.callback, { cookie: denied.cookies })).headers.get("location"),
    ).toContain("error=authorization");
    grantedScope = "identify";
    const expired = await start();
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(oauthAttempts).set({ expiresAt: new Date(0) });
      }),
    );
    const before = tokenExchanges;
    expect(
      (await app.request(expired.callback, { cookie: expired.cookies })).headers.get("location"),
    ).toContain("error=authorization");
    expect(tokenExchanges).toBe(before);
  });
});
