import { Effect } from "effect";

import { oauthProvider, verifyOAuthAttestation } from "@ens-social-verification/application";
import {
  createVerificationClaim,
  oauthAttestationMessage,
  oauthMethod,
  oauthTarget,
} from "@ens-social-verification/protocol";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const attestor = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const id = "f3b057a2-54b1-46ad-9466-9c20b4901f8b";
const identity = {
  provider: "discord",
  issuer: "https://discord.com",
  subject: "123456789",
  value: "alice",
};
const claim = Effect.runSync(
  createVerificationClaim({
    name: "alice.eth",
    recordKey: "com.discord",
    value: identity.value,
    authority: stranger.address,
    method: oauthMethod,
    target: oauthTarget(identity, id),
    issuedAt: "1700000000",
    validUntil: "1700604800",
  }),
);
const uri = `https://api.example.com/verification/oauth/proofs/${id}`;

async function envelope() {
  return {
    v: "ensrv1" as const,
    claim,
    authoritySignature: "0x1234" as const,
    proof: {
      attemptId: id,
      identity,
      attestor: attestor.address,
      signature: await attestor.signMessage({ message: oauthAttestationMessage(claim, uri) }),
    },
  };
}

describe("OAuth attestation evidence", () => {
  it("verifies a configured attestor, not the key supplied by an untrusted proof", async () => {
    const proof = await envelope();
    await expect(
      Effect.runPromise(verifyOAuthAttestation(proof, uri, attestor.address)),
    ).resolves.toEqual(proof);
    await expect(
      Effect.runPromise(verifyOAuthAttestation(proof, uri, stranger.address)),
    ).rejects.toThrow();
  });
  it("binds the account, exact value, name, provider, and proof URL", async () => {
    const proof = await envelope();
    await Promise.all(
      [
        { subject: "987654321" },
        { value: "mallory" },
        { provider: "other" },
        { issuer: "https://evil.test" },
      ].map((patch) =>
        expect(
          Effect.runPromise(
            verifyOAuthAttestation(
              { ...proof, proof: { ...proof.proof, identity: { ...identity, ...patch } } },
              uri,
              attestor.address,
            ),
          ),
        ).rejects.toThrow(),
      ),
    );
    await expect(
      Effect.runPromise(
        verifyOAuthAttestation(
          { ...proof, claim: { ...claim, name: "bob.eth" } },
          uri,
          attestor.address,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(verifyOAuthAttestation(proof, `${uri}/other`, attestor.address)),
    ).rejects.toThrow();
  });
  it("allows only registered providers and rejects bot identities", async () => {
    await expect(Effect.runPromise(oauthProvider("constructor"))).rejects.toThrow();
    const discord = Effect.runSync(oauthProvider("discord"));
    await expect(
      Effect.runPromise(discord.identity({ id: "123", username: "alice", bot: true })),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(discord.identity({ id: "123", username: "alice" })),
    ).resolves.toMatchObject({ subject: "123", value: "alice" });
  });
});
