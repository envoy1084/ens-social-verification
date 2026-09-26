import { Effect, Schema } from "effect";

import { Database, farcasterAttempts } from "@ens-social-verification/database";
import {
  farcasterNonce,
  farcasterRecordKey,
  farcasterVerificationKey,
  getVerificationTypedData,
} from "@ens-social-verification/protocol";
import {
  FarcasterStartResponse,
  FarcasterReadyResponse,
  FarcasterPublication,
} from "@ens-social-verification/protocol/dto";
import { FarcasterEnvelope } from "@ens-social-verification/protocol/schema";
import { createWalletClient, viemConnector } from "@farcaster/auth-client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { responseCookie } from "../fixtures/auth.js";
import { farcasterFixture } from "../fixtures/farcaster.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("DATABASE_URL must end in _test");
const owner = privateKeyToAccount(generatePrivateKey());
const custody = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const app = farcasterFixture(databaseUrl, owner.address, custody.address);
const wallet = createWalletClient({ ethereum: viemConnector({ rpcUrl: "http://localhost:1" }) });
let cookie = "";

beforeAll(async () => {
  await app.auth.runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.delete(farcasterAttempts);
    }),
  );
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
  await app.dispose();
  await app.auth.dispose();
  await app.auth.runtime.dispose();
});

async function start(name = "alice.eth") {
  const response = await app.request("start", { cookie, body: { name } });
  expect(response.status).toBe(200);
  return Schema.decodeUnknownSync(FarcasterStartResponse)(await response.json());
}
async function approval(pending: typeof FarcasterStartResponse.Type, nonce = pending.nonce) {
  const result = wallet.buildSignInMessage({
    fid: 123,
    address: custody.address,
    domain: pending.intent.domain,
    uri: pending.intent.uri,
    nonce,
    requestId: pending.id,
    expirationTime: new Date(Number(pending.intent.validUntil) * 1000),
  });
  if (result.isError) throw result.error;
  return {
    message: result.message,
    signature: await custody.signMessage({ message: result.message }),
    username: "alice",
  };
}

describe("Farcaster signed proof workflow", () => {
  it("requires a same-origin session and current ENS owner", async () => {
    expect((await app.request("start", { body: { name: "alice.eth" } })).status).toBe(401);
    expect(
      (
        await app.request("start", {
          cookie,
          origin: "https://evil.test",
          body: { name: "alice.eth" },
        })
      ).status,
    ).toBe(403);
    app.rpc.owner = stranger.address;
    expect((await app.request("start", { cookie, body: { name: "alice.eth" } })).status).toBe(403);
    app.rpc.owner = owner.address;
  });
  it("binds approvals to each name and attempt, supports auth addresses and rejects expiry", async () => {
    const first = await start();
    const second = await start("bob.eth");
    expect(farcasterNonce({ ...first.intent, name: "bob.eth" })).not.toBe(first.nonce);
    const signed = await approval(first);
    expect(
      (await app.request(`attempts/${second.id}/complete`, { cookie, body: signed })).status,
    ).toBe(400);
    expect((await app.request(`attempts/${first.id}/complete`, { body: signed })).status).toBe(401);
    app.identity.authAddress = true;
    app.identity.custodyActive = false;
    expect(
      (await app.request(`attempts/${first.id}/complete`, { cookie, body: signed })).status,
    ).toBe(200);
    expect(
      (await app.request(`attempts/${first.id}/complete`, { cookie, body: signed })).status,
    ).toBe(200);
    expect(
      (
        await app.request(`attempts/${first.id}/complete`, {
          cookie,
          body: { ...signed, message: `${signed.message} altered` },
        })
      ).status,
    ).toBe(400);
    app.identity.authAddress = false;
    app.identity.custodyActive = true;
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(farcasterAttempts).set({ expiresAt: new Date(0) });
      }),
    );
    expect(
      (
        await app.request(`attempts/${second.id}/complete`, {
          cookie,
          body: await approval(second),
        })
      ).status,
    ).toBe(400);
  });
  it("publishes one immutable proof and rechecks both signatures and live identity", async () => {
    const pending = await start();
    const signed = await approval(pending);
    const response = await app.request(`attempts/${pending.id}/complete`, { cookie, body: signed });
    expect(response.status).toBe(200);
    const ready = Schema.decodeUnknownSync(FarcasterReadyResponse)(await response.json());
    const bad = await stranger.signTypedData(getVerificationTypedData(ready.claim));
    expect(
      (
        await app.request(`attempts/${pending.id}/publish`, {
          cookie,
          body: { authoritySignature: bad },
        })
      ).status,
    ).toBe(400);
    const signature = await owner.signTypedData(getVerificationTypedData(ready.claim));
    const responses = await Promise.all(
      [1, 2].map(() =>
        app.request(`attempts/${pending.id}/publish`, {
          cookie,
          body: { authoritySignature: signature },
        }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const publication = Schema.decodeUnknownSync(FarcasterPublication)(await responses[0]?.json());
    const envelope = Schema.decodeUnknownSync(FarcasterEnvelope)(
      await (await app.request(`proofs/${pending.id}`)).json(),
    );
    expect(envelope.proof.fid).toBe(123);
    expect(JSON.stringify(envelope)).not.toContain("sessionHash");
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.records[farcasterRecordKey] = "alice";
    app.records[farcasterVerificationKey] = publication.descriptor;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "verified",
      username: "alice",
    });
    app.identity.unavailable = true;
    expect((await app.request("status?name=alice.eth")).status).toBe(503);
    app.identity.unavailable = false;
    app.identity.fid = 456n;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.identity.fid = 123n;
    app.identity.username = "renamed";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.identity.username = "alice";
    app.rpc.owner = stranger.address;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.rpc.owner = owner.address;
    app.records[farcasterRecordKey] = "";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.records[farcasterVerificationKey] = "";
    expect(await (await app.request(`proofs/${pending.id}`)).json()).toEqual(envelope);
  });
});
