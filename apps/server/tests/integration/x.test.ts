import { Effect, Schema } from "effect";

import { Database, xAttempts, xPublications } from "@ens-social-verification/database";
import { getVerificationTypedData, xProofPost } from "@ens-social-verification/protocol";
import {
  XAttemptResponse,
  XPublishResponse,
  XStartResponse,
} from "@ens-social-verification/protocol/dto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { responseCookie } from "../fixtures/auth.js";
import { xFixture } from "../fixtures/x.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("DATABASE_URL must end in _test");
const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const app = xFixture(databaseUrl, owner.address);
let sessionCookie = "";

beforeAll(async () => {
  await app.auth.runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.delete(xPublications);
      yield* db.delete(xAttempts);
    }),
  );
  const nonce = await app.auth.request("nonce");
  const nonceBody = Schema.decodeUnknownSync(Schema.Struct({ nonce: Schema.String }))(
    await nonce.json(),
  );
  const cookie = responseCookie(nonce, "ens-challenge=");
  const messageResponse = await app.auth.request("message", {
    cookie,
    body: { address: owner.address, chainId: 11155111, nonce: nonceBody.nonce },
  });
  const { message } = Schema.decodeUnknownSync(Schema.Struct({ message: Schema.String }))(
    await messageResponse.json(),
  );
  const signature = await owner.signMessage({ message });
  sessionCookie = responseCookie(
    await app.auth.request("verify", { cookie, body: { message, signature } }),
    "ens-session=",
  );
});
afterAll(async () => {
  await app.dispose();
  await app.auth.dispose();
  await app.auth.runtime.dispose();
});

async function start() {
  const response = await app.request("start", {
    cookie: sessionCookie,
    body: { name: "alice.eth" },
  });
  expect(response.status).toBe(200);
  const pending = Schema.decodeUnknownSync(XStartResponse)(await response.json());
  const url = new URL(pending.authorizeUrl);
  expect(url.searchParams.get("scope")).toBe("users.read tweet.read tweet.write");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  return {
    ...pending,
    callback: `callback?code=test&state=${url.searchParams.get("state")}`,
    cookie: `${sessionCookie}; ${responseCookie(response, "ens-x=")}`,
  };
}

describe("X signed post workflow", () => {
  it("requires session, same-origin writes and current ENS authority", async () => {
    expect((await app.request("start", { body: { name: "alice.eth" } })).status).toBe(401);
    expect(
      (
        await app.request("start", {
          body: { name: "alice.eth" },
          cookie: sessionCookie,
          origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    app.rpc.owner = stranger.address;
    expect(
      (await app.request("start", { body: { name: "alice.eth" }, cookie: sessionCookie })).status,
    ).toBe(403);
    app.rpc.owner = owner.address;
  });
  it("binds OAuth to the session and PKCE cookie and rejects replay", async () => {
    const pending = await start();
    const missing = await app.request(pending.callback, { cookie: sessionCookie });
    expect(missing.headers.get("location")).toContain("error=authorization");
    const callback = await app.request(pending.callback, { cookie: pending.cookie });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain(`xAttempt=${pending.id}`);
    expect(
      (await app.request(pending.callback, { cookie: pending.cookie })).headers.get("location"),
    ).toContain("error=authorization");
    const attempt = await app.request(`attempts/${pending.id}`, { cookie: sessionCookie });
    const body = await attempt.text();
    expect(body).not.toContain("test-x-token");
    expect(body).not.toContain("encryptedToken");
  });
  it("rejects bad signatures, creates one post under races, and rechecks live evidence", async () => {
    const pending = await start();
    await app.request(pending.callback, { cookie: pending.cookie });
    const draft = Schema.decodeUnknownSync(XAttemptResponse)(
      await (await app.request(`attempts/${pending.id}`, { cookie: sessionCookie })).json(),
    );
    if (!draft.claim) throw new Error("Missing claim");
    const bad = await stranger.signTypedData(getVerificationTypedData(draft.claim));
    expect(
      (
        await app.request(`attempts/${pending.id}/publish`, {
          cookie: sessionCookie,
          body: { authoritySignature: bad },
        })
      ).status,
    ).toBe(400);
    const signature = await owner.signTypedData(getVerificationTypedData(draft.claim));
    const responses = await Promise.all(
      [1, 2].map(() =>
        app.request(`attempts/${pending.id}/publish`, {
          cookie: sessionCookie,
          body: { authoritySignature: signature },
        }),
      ),
    );
    expect(app.creations()).toBe(1);
    const successful = responses.find((response) => response.status === 200);
    if (!successful) throw new Error("No successful publication");
    const publication = Schema.decodeUnknownSync(XPublishResponse)(await successful.json());
    expect(publication.proofUri).toContain("https://api.example.test/verification/x/proofs/");
    expect(
      (
        await app.request(`attempts/${pending.id}/publish`, {
          cookie: sessionCookie,
          body: { authoritySignature: signature },
        })
      ).status,
    ).toBe(200);
    expect(app.creations()).toBe(1);
    app.records["com.twitter"] = "alice";
    app.records["verification[text][com.twitter]"] = publication.descriptor;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "verified",
      login: "alice",
    });
    const publicProof = await app.request(`proofs/${pending.id}`);
    expect(publicProof.status).toBe(200);
    expect(await publicProof.text()).not.toContain("test-x-token");
    expect(app.post.text).toBe(xProofPost(draft.claim));
    app.failure.unavailable = true;
    expect((await app.request("status?name=alice.eth")).status).toBe(503);
    app.failure.unavailable = false;
    app.post.author_id = "456";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.post.author_id = "123";
    app.post.text = "Edited proof";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.post.text = xProofPost(draft.claim);
    app.post.editHistoryIds.push("1900000000000000001");
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.post.editHistoryIds.pop();
    app.identity.login = "renamed";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.identity.login = "alice";
    app.rpc.owner = stranger.address;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.rpc.owner = owner.address;
    app.records["com.twitter"] = "bob";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const row = (yield* db.select().from(xAttempts)).find(
          (attempt) => attempt.id === pending.id,
        );
        expect(row?.encryptedToken).toBeTruthy();
      }),
    );
    const removal = { name: "alice.eth", proofUri: publication.proofUri };
    expect((await app.request("removal/post", { body: removal })).status).toBe(401);
    expect(
      (
        await app.request("removal/post", {
          body: removal,
          cookie: sessionCookie,
          origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      await (await app.request("removal/options", { body: removal, cookie: sessionCookie })).json(),
    ).toEqual({ canDeletePost: true });
    expect(
      (await app.request("removal/post", { body: removal, cookie: sessionCookie })).status,
    ).toBe(400);
    app.records["com.twitter"] = "";
    expect(
      (await app.request("removal/post", { body: removal, cookie: sessionCookie })).status,
    ).toBe(400);
    app.records["verification[text][com.twitter]"] = "";
    app.rpc.owner = stranger.address;
    expect(
      (await app.request("removal/post", { body: removal, cookie: sessionCookie })).status,
    ).toBe(403);
    app.rpc.owner = owner.address;
    app.post.author_id = "456";
    expect(
      (await app.request("removal/post", { body: removal, cookie: sessionCookie })).status,
    ).toBe(400);
    expect(app.deletions()).toBe(0);
    app.post.author_id = "123";
    expect(
      await (await app.request("removal/post", { body: removal, cookie: sessionCookie })).json(),
    ).toMatchObject({ deleted: true });
    expect(app.deletions()).toBe(1);
    expect(
      await (await app.request("removal/options", { body: removal, cookie: sessionCookie })).json(),
    ).toEqual({ canDeletePost: false });
    expect(
      await (await app.request("removal/post", { body: removal, cookie: sessionCookie })).json(),
    ).toMatchObject({ deleted: false });
    expect(app.deletions()).toBe(1);
  });
  it("does not retry an ambiguous post creation", async () => {
    const pending = await start();
    await app.request(pending.callback, { cookie: pending.cookie });
    const draft = Schema.decodeUnknownSync(XAttemptResponse)(
      await (await app.request(`attempts/${pending.id}`, { cookie: sessionCookie })).json(),
    );
    if (!draft.claim) throw new Error("Missing claim");
    const signature = await owner.signTypedData(getVerificationTypedData(draft.claim));
    app.failure.ambiguous = true;
    const before = app.creations();
    const options = { cookie: sessionCookie, body: { authoritySignature: signature } };
    expect((await app.request(`attempts/${pending.id}/publish`, options)).status).toBe(503);
    expect((await app.request(`attempts/${pending.id}/publish`, options)).status).toBe(400);
    expect(app.creations()).toBe(before + 1);
    app.failure.ambiguous = false;
  });
  it("rejects expired attempts before issuing a post", async () => {
    const pending = await start();
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(xAttempts).set({ expiresAt: new Date(0) });
      }),
    );
    expect(
      (await app.request(pending.callback, { cookie: pending.cookie })).headers.get("location"),
    ).toContain("error=authorization");
    expect((await app.request(`attempts/${pending.id}`, { cookie: sessionCookie })).status).toBe(
      400,
    );
  });
});
