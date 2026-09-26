import { Effect, Schema } from "effect";

import { Database, githubAttempts, githubPublications } from "@ens-social-verification/database";
import {
  decodeGithubEnvelope,
  getVerificationTypedData,
  githubProofFilename,
  serializeGithubEnvelope,
} from "@ens-social-verification/protocol";
import {
  GithubAttemptResponse,
  GithubPublishResponse,
  GithubStartResponse,
} from "@ens-social-verification/protocol/dto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { responseCookie } from "../fixtures/auth.js";
import { githubFixture } from "../fixtures/github.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("DATABASE_URL must end in _test");
const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const app = githubFixture(databaseUrl, owner.address);
let sessionCookie = "";

beforeAll(async () => {
  await app.auth.runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      yield* db.delete(githubPublications);
      yield* db.delete(githubAttempts);
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
  const pending = Schema.decodeUnknownSync(GithubStartResponse)(await response.json());
  const url = new URL(pending.authorizeUrl);
  expect(url.searchParams.get("scope")).toBe("gist");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  return {
    ...pending,
    callback: `callback?code=test&state=${url.searchParams.get("state")}`,
    cookie: `${sessionCookie}; ${responseCookie(response, "ens-github=")}`,
  };
}

describe("GitHub signed gist workflow", () => {
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
    expect(callback.headers.get("location")).toContain(`githubAttempt=${pending.id}`);
    expect(
      (await app.request(pending.callback, { cookie: pending.cookie })).headers.get("location"),
    ).toContain("error=authorization");
    const attempt = await app.request(`attempts/${pending.id}`, { cookie: sessionCookie });
    const body = await attempt.text();
    expect(body).not.toContain("test-github-token");
    expect(body).not.toContain("encryptedToken");
  });
  it("rejects bad signatures, creates one gist under races, and rechecks live evidence", async () => {
    const pending = await start();
    await app.request(pending.callback, { cookie: pending.cookie });
    const draft = Schema.decodeUnknownSync(GithubAttemptResponse)(
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
    const publication = Schema.decodeUnknownSync(GithubPublishResponse)(await successful.json());
    expect(publication.proofUri).toContain("https://gist.github.com/alice/");
    expect(
      (
        await app.request(`attempts/${pending.id}/publish`, {
          cookie: sessionCookie,
          body: { authoritySignature: signature },
        })
      ).status,
    ).toBe(200);
    expect(app.creations()).toBe(1);
    app.records["com.github"] = "alice";
    app.records["verification[text][com.github]"] = publication.descriptor;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "verified",
      login: "alice",
    });
    app.gist.owner.id = 456;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.gist.owner.id = 123;
    const proofFile = app.gist.files[githubProofFilename];
    const originalContent = proofFile.content;
    const envelope = await Effect.runPromise(decodeGithubEnvelope(originalContent));
    app.gist.owner.id = 456;
    app.identity.id = "456";
    proofFile.content = serializeGithubEnvelope({
      ...envelope,
      proof: { ...envelope.proof, githubId: "456" },
    });
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    proofFile.content = originalContent;
    app.gist.owner.id = 123;
    app.identity.id = "123";
    app.rpc.owner = stranger.address;
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    app.rpc.owner = owner.address;
    app.records["com.github"] = "bob";
    expect(await (await app.request("status?name=alice.eth")).json()).toMatchObject({
      status: "unverified",
    });
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        const row = (yield* db.select().from(githubAttempts)).find(
          (attempt) => attempt.id === pending.id,
        );
        expect(row?.encryptedToken).toBeNull();
      }),
    );
  });
  it("rejects expired attempts before issuing a gist", async () => {
    const pending = await start();
    await app.auth.runtime.runPromise(
      Effect.gen(function* () {
        const db = yield* Database;
        yield* db.update(githubAttempts).set({ expiresAt: new Date(0) });
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
