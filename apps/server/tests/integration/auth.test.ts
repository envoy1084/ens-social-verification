import { Effect, Schema } from "effect";
import { Layer } from "effect";

/* eslint-disable no-await-in-loop -- Sequential attempts exercise the persistent challenge limit. */
import {
  ChallengeRepository,
  SessionRepository,
  TransactionService,
  Database,
  authChallenges,
  sessions,
} from "@ens-social-verification/database";
import { SessionInsert } from "@ens-social-verification/protocol/model";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authFixture, responseCookie } from "../fixtures/auth.js";

const account = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("DATABASE_URL must point to a dedicated database ending in _test");
}

const app = authFixture(databaseUrl);
const secureApp = authFixture(databaseUrl, true);
const limitedApp = authFixture(databaseUrl, true);

async function challenge() {
  const nonceResponse = await app.request("nonce");
  expect(nonceResponse.status).toBe(200);
  const { nonce } = Schema.decodeUnknownSync(Schema.Struct({ nonce: Schema.String }))(
    await nonceResponse.json(),
  );
  const cookie = responseCookie(nonceResponse, "ens-challenge=");
  const body = { address: account.address, chainId: 11155111, nonce };
  const response = await app.request("message", { body, cookie });
  expect(response.status).toBe(200);
  const { message } = Schema.decodeUnknownSync(Schema.Struct({ message: Schema.String }))(
    await response.json(),
  );
  const signature = await account.signMessage({ message });

  return { cookie, body, message, signature, nonceResponse };
}

beforeAll(async () => {
  await app.runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.delete(sessions);
      yield* db.delete(authChallenges);
    }),
  );
});

afterAll(async () => {
  await app.dispose();
  await secureApp.dispose();
  await limitedApp.dispose();
  await app.runtime.dispose();
  await secureApp.runtime.dispose();
  await limitedApp.runtime.dispose();
});

describe("wallet authentication with PostgreSQL", () => {
  it("permits credentialed CORS only for the configured frontend", async () => {
    const preflight = await app.handler(
      new Request("http://localhost:8080/auth/message", {
        method: "OPTIONS",
        headers: {
          origin: app.origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(app.origin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    const response = await app.request("session", { method: "GET" });
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(app.origin);
    const foreign = await app.request("nonce", { origin: "https://attacker.example" });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("access-control-allow-origin")).toBe(app.origin);
  });

  it("signs in, returns a cookie-backed session, and revokes it on logout", async () => {
    const flow = await challenge();
    expect(flow.nonceResponse.headers.get("set-cookie")).toContain("HttpOnly");
    expect(flow.nonceResponse.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(flow.message).toContain("localhost:3000 wants you to sign in");
    expect(flow.message).toContain("Chain ID: 11155111");
    const verified = await app.request("verify", { body: flow, cookie: flow.cookie });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("cache-control")).toBe("no-store");
    const session = await verified.json();
    expect(session).toEqual({
      address: account.address,
      chainId: 11155111,
      expiresAt: expect.any(String),
    });
    const cookie = responseCookie(verified, "ens-session=");
    expect(await (await app.request("session", { method: "GET", cookie })).json()).toEqual(session);
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(401);
    expect((await app.request("logout", { cookie })).status).toBe(204);
    expect((await app.request("session", { method: "GET", cookie })).status).toBe(401);
    expect((await app.request("logout", { cookie })).status).toBe(204);
  });

  it("rejects missing or foreign origins and missing browser binding", async () => {
    expect(
      (await app.handler(new Request(`${app.origin}/auth/nonce`, { method: "POST" }))).status,
    ).toBe(403);
    expect((await app.request("nonce", { origin: "https://attacker.example" })).status).toBe(403);
    const flow = await challenge();
    expect((await app.request("message", { body: flow.body })).status).toBe(401);
    expect((await app.request("verify", { body: flow })).status).toBe(401);
    const another = await challenge();
    expect((await app.request("verify", { body: flow, cookie: another.cookie })).status).toBe(401);
  });

  it("rejects other chains, immutable-message changes, and wrong signatures", async () => {
    const flow = await challenge();
    expect(
      (await app.request("message", { body: { ...flow.body, chainId: 1 }, cookie: flow.cookie }))
        .status,
    ).toBe(400);
    expect(
      (
        await app.request("message", {
          body: { ...flow.body, address: stranger.address },
          cookie: flow.cookie,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("verify", {
          body: { ...flow, message: flow.message.replace("localhost:3000", "attacker.example") },
          cookie: flow.cookie,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request("verify", {
          body: { ...flow, message: flow.message.replace("Sign in to", "Log in to") },
          cookie: flow.cookie,
        })
      ).status,
    ).toBe(401);
    const signature = await stranger.signMessage({ message: flow.message });
    expect(
      (await app.request("verify", { body: { ...flow, signature }, cookie: flow.cookie })).status,
    ).toBe(401);
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(200);
  });

  it("allows only one session when the same proof is submitted concurrently", async () => {
    const flow = await challenge();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => app.request("verify", { body: flow, cookie: flow.cookie })),
    );
    expect(responses.map((response) => response.status).toSorted()).toEqual([200, 401, 401, 401]);
  });

  it("rotates the previous session on successful sign-in", async () => {
    const first = await challenge();
    const previous = responseCookie(
      await app.request("verify", { body: first, cookie: first.cookie }),
      "ens-session=",
    );
    const next = await challenge();
    const verified = await app.request("verify", {
      body: next,
      cookie: `${next.cookie}; ${previous}`,
    });
    expect(verified.status).toBe(200);
    const current = responseCookie(verified, "ens-session=");
    expect(current).not.toBe(previous);
    expect((await app.request("session", { method: "GET", cookie: previous })).status).toBe(401);
    expect((await app.request("session", { method: "GET", cookie: current })).status).toBe(200);
  });

  it("caps invalid signature attempts persistently", async () => {
    const flow = await challenge();
    const signature = await stranger.signMessage({ message: flow.message });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        (await app.request("verify", { body: { ...flow, signature }, cookie: flow.cookie })).status,
      ).toBe(401);
    }
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(401);
  });

  it("rolls back nonce consumption when session insertion fails", async () => {
    const signedIn = await challenge();
    expect((await app.request("verify", { body: signedIn, cookie: signedIn.cookie })).status).toBe(
      200,
    );
    const flow = await challenge();

    await app.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const challenges = yield* ChallengeRepository;
        const sessionRepository = yield* SessionRepository;
        const transactions = yield* TransactionService;
        const challengeRow = (yield* db.select().from(authChallenges)).find(
          (row) => row.message === flow.message,
        );
        const [existingSession] = yield* db.select().from(sessions);
        if (!challengeRow || !existingSession) throw new Error("Missing test rows");

        const exit = yield* transactions
          .run(
            Effect.gen(function* () {
              yield* challenges.consume(challengeRow.id, new Date());
              yield* sessionRepository.create(
                Schema.decodeUnknownSync(SessionInsert)(existingSession),
              );
            }),
          )
          .pipe(Effect.exit);

        expect(exit).toHaveProperty("_tag", "Failure");
        const unchanged = (yield* db.select().from(authChallenges)).find(
          (row) => row.id === challengeRow.id,
        );
        expect(unchanged?.consumedAt).toBeNull();
        expect(challengeRow.browserTokenHash).not.toBe(flow.cookie.split("=")[1]);
        expect(challengeRow.nonceHash).not.toBe(flow.body.nonce);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            ChallengeRepository.layer,
            SessionRepository.layer,
            TransactionService.layer,
          ),
        ),
      ),
    );

    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(200);
  });

  it("enforces challenge and session expiry in the database", async () => {
    const flow = await challenge();
    await app.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(authChallenges).set({ expiresAt: new Date(0) });
      }),
    );
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(401);
    const fresh = await challenge();
    const cookie = responseCookie(
      await app.request("verify", { body: fresh, cookie: fresh.cookie }),
      "ens-session=",
    );
    await app.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(sessions).set({ expiresAt: new Date(0) });
      }),
    );
    expect((await app.request("session", { method: "GET", cookie })).status).toBe(401);
  });

  it("verifies deployed ERC-1271 wallets and distinguishes provider outages", async () => {
    const flow = await challenge();
    app.rpc.code = "0x6000";
    app.rpc.magicValue = "0xffffffff";
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(401);
    app.rpc.unavailable = true;
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(503);
    app.rpc.unavailable = false;
    app.rpc.magicValue = "0x1626ba7e";
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(200);
    app.rpc.code = "0x";
  });

  it("authenticates delegated accounts with own-key or ERC-1271 approval", async () => {
    const flow = await challenge();
    app.rpc.code = `0xef0100${stranger.address.slice(2)}`;
    app.rpc.magicValue = "0xffffffff";
    const wrong = await stranger.signMessage({ message: flow.message });
    expect(
      (
        await app.request("verify", {
          body: { ...flow, signature: wrong },
          cookie: flow.cookie,
        })
      ).status,
    ).toBe(401);
    expect((await app.request("verify", { body: flow, cookie: flow.cookie })).status).toBe(200);
    const custom = await challenge();
    app.rpc.magicValue = "0x1626ba7e";
    expect(
      (
        await app.request("verify", {
          body: { ...custom, signature: "0x1234" },
          cookie: custom.cookie,
        })
      ).status,
    ).toBe(200);
    app.rpc.code = "0x";
  });

  it("sets host-only Secure cookies for HTTPS deployments", async () => {
    const response = await secureApp.request("nonce");
    expect(response.status).toBe(200);
    const header = response.headers.get("set-cookie");
    expect(header).toContain("__Host-ens-challenge=");
    expect(header).toContain("Secure");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Domain=");
  });

  it("rejects malformed, oversized and non-JSON bodies", async () => {
    expect(
      (await app.request("verify", { body: { message: "bad", signature: "invalid" } })).status,
    ).toBe(400);
    expect((await app.request("message", { body: "x".repeat(20_000) })).status).toBe(413);
    expect(
      (
        await app.handler(
          new Request(`${app.origin}/auth/message`, {
            method: "POST",
            headers: { origin: app.origin },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(415);
  });

  it("bounds public auth requests and includes a retry hint", async () => {
    for (let count = 0; count < 120; count++) {
      expect((await limitedApp.request("session", { method: "GET" })).status).toBe(401);
    }

    const response = await limitedApp.request("session", { method: "GET" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
