import { Resolver } from "node:dns/promises";

import { Effect, Schema } from "effect";

import { Database, EmailAttemptRepository, emailAttempts } from "@ens-social-verification/database";
import { getVerificationTypedData } from "@ens-social-verification/protocol";
import {
  EmailStartResponse,
  EmailReadyResponse,
  EmailPublication,
} from "@ens-social-verification/protocol/dto";
import { EmailEnvelope } from "@ens-social-verification/protocol/schema";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { responseCookie } from "../fixtures/auth.js";
import { emailFixture } from "../fixtures/email.js";
import { signedEmailFixture } from "../fixtures/signed-email.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("DATABASE_URL must end in _test");
const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const app = emailFixture(databaseUrl, owner.address);
const signer = signedEmailFixture();
const publicKey = signer.publicKey;
let cookie = "";
let subject = "";
let raw = "";
let received = false;
let dnsUnavailable = false;
const resolveDns = async () => {
  if (dnsUnavailable) throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
  return [[`v=DKIM1; k=rsa; p=${publicKey}`]];
};
const fetchEmail: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.origin === "https://api.resend.com" && url.pathname === "/emails/receiving")
    return Response.json({
      object: "list",
      has_more: false,
      data: received
        ? [
            {
              id: "received-email",
              subject,
              to: ["verify@proof.example.com"],
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    });
  if (
    url.origin === "https://api.resend.com" &&
    url.pathname === "/emails/receiving/received-email"
  )
    return Response.json({ raw: { download_url: "https://cdn.resend.app/raw/test" } });
  if (url.href === "https://cdn.resend.app/raw/test") return new Response(raw);
  throw new Error("Unexpected email transport request");
};
beforeEach(() => {
  vi.spyOn(Resolver.prototype, "resolveTxt").mockImplementation(resolveDns);
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchEmail);
});

beforeAll(async () => {
  await app.auth.runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.delete(emailAttempts);
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
  vi.restoreAllMocks();
  await app.dispose();
  await app.auth.dispose();
  await app.auth.runtime.dispose();
});

async function start() {
  const response = await app.request("start", {
    cookie,
    body: { name: "alice.eth", email: "alice@example.com" },
  });
  expect(response.status).toBe(200);
  return Schema.decodeUnknownSync(EmailStartResponse)(await response.json());
}

describe("email receiving and signed publication", () => {
  it("requires a same-origin session and name ownership", async () => {
    const body = { name: "alice.eth", email: "alice@example.com" };
    expect((await app.request("start", { body })).status).toBe(401);
    expect((await app.request("start", { cookie, body, origin: "https://evil.test" })).status).toBe(
      403,
    );
    app.rpc.owner = stranger.address;
    expect((await app.request("start", { cookie, body })).status).toBe(403);
    app.rpc.owner = owner.address;
  });
  it("polls Resend, keeps evidence private, verifies signatures, and removes only after record clearing", async () => {
    const pending = await start();
    const path = `attempts/${pending.id}`;
    expect((await app.request(`${path}/complete`, { body: {} })).status).toBe(401);
    expect(
      await (await app.request(`${path}/complete`, { cookie, body: {} })).json(),
    ).toMatchObject({ ready: false });
    expect((await app.request(`proofs/${pending.id}`)).status).toBe(400);
    subject = pending.subject;
    const message = `From: alice@example.com\r\nTo: verify@proof.example.com\r\nSubject: ${subject}\r\n\r\nVerify my ENS email record.\r\n`;
    raw = await signer.sign(message);
    received = true;
    const completed = await app.request(`${path}/complete`, { cookie, body: {} });
    expect(completed.status).toBe(200);
    const ready = Schema.decodeUnknownSync(EmailReadyResponse)(await completed.json());
    expect(ready.ready).toBe(true);
    if (!ready.claim) throw new Error("Expected claim");
    expect((await app.request(`${path}/preview`)).status).toBe(401);
    expect(await (await app.request(`${path}/preview`, { cookie })).json()).toEqual({
      rawEmail: Buffer.from(raw).toString("base64"),
    });
    const signed = await owner.signTypedData(getVerificationTypedData(ready.claim));
    expect(
      (
        await app.request(`${path}/publish`, {
          cookie,
          body: { authoritySignature: signed, consent: false },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(`${path}/publish`, {
          cookie,
          body: {
            authoritySignature: await stranger.signTypedData(getVerificationTypedData(ready.claim)),
            consent: true,
          },
        })
      ).status,
    ).toBe(400);
    const publish = await app.request(`${path}/publish`, {
      cookie,
      body: { authoritySignature: signed, consent: true },
    });
    expect(publish.status).toBe(200);
    const publication = Schema.decodeUnknownSync(EmailPublication)(await publish.json());
    const proof = Schema.decodeUnknownSync(EmailEnvelope)(
      await (await app.request(`proofs/${pending.id}`)).json(),
    );
    expect(JSON.stringify(proof)).not.toContain("sessionHash");
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.records.email = "alice@example.com";
    app.records["verification[text][email]"] = publication.descriptor;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "verified",
      email: "alice@example.com",
    });
    dnsUnavailable = true;
    expect((await app.request("status?name=alice.eth")).status).toBe(503);
    dnsUnavailable = false;
    app.rpc.owner = stranger.address;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.rpc.owner = owner.address;
    const removal = { name: "alice.eth", proofUri: publication.proofUri };
    expect((await app.request("removal", { cookie, body: removal })).status).toBe(400);
    app.records.email = "";
    expect((await app.request("removal", { cookie, body: removal })).status).toBe(400);
    app.records["verification[text][email]"] = "";
    expect(await (await app.request("removal", { cookie, body: removal })).json()).toEqual({
      deleted: true,
    });
    expect((await app.request(`proofs/${pending.id}`)).status).toBe(400);
    expect(await (await app.request("removal", { cookie, body: removal })).json()).toEqual({
      deleted: true,
    });
  });
  it("expires private attempts and erases unpublished email evidence", async () => {
    const pending = await start();
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(emailAttempts).set({ expiresAt: new Date(0) });
      }),
    );
    expect(
      (await app.request(`attempts/${pending.id}/complete`, { cookie, body: {} })).status,
    ).toBe(400);
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const repo = yield* EmailAttemptRepository;
        yield* repo.clearExpired();
      }).pipe(Effect.provide(EmailAttemptRepository.layer)),
    );
    const rows = await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        return yield* db.select().from(emailAttempts);
      }),
    );
    expect(rows).toHaveLength(0);
  });
});
