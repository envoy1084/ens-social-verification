import { Effect } from "effect";

import { verifyEmailDkim } from "@ens-social-verification/application";
import { emailClaim, emailSubject } from "@ens-social-verification/protocol";
import { describe, expect, it } from "vitest";

import { signedEmailFixture } from "../fixtures/signed-email.js";

const signer = signedEmailFixture();
const publicKey = signer.publicKey;
const intent = {
  id: "f3b057a2-54b1-46ad-9466-9c20b4901f8b",
  name: "alice.eth",
  authority: "0x0000000000000000000000000000000000000001" as const,
  email: "Alice@example.com",
  recipient: "verify@proof.example.com",
  issuedAt: "1700000000",
  validUntil: "1700604800",
};
const claim = Effect.runSync(emailClaim(intent));
const message = `From: Alice <${intent.email}>\r\nTo: ${intent.recipient}\r\nSubject: ${emailSubject(claim)}\r\n\r\nVerify this ENS claim.\r\n`;
const resolver = async () => [[`v=DKIM1; k=rsa; p=${publicKey}`]];

const signed = (input = message, options?: Parameters<typeof signer.sign>[1]) =>
  signer.sign(input, options);

function verify(raw: string) {
  return Effect.runPromise(
    verifyEmailDkim({ intent, rawEmail: Buffer.from(raw).toString("base64") }, claim, resolver),
  );
}

describe("email DKIM evidence", () => {
  it("verifies the original signed email independently of Resend", async () => {
    await expect(verify(await signed())).resolves.toBeUndefined();
  });
  it.each(["subject", "body", "from"])("rejects changed %s", async (field) => {
    const raw = await signed();
    const altered =
      field === "subject"
        ? raw.replace(emailSubject(claim), "Wrong claim")
        : field === "body"
          ? raw.replace("Verify this ENS claim.", "Changed body.")
          : raw.replace("Alice@example.com", "Mallory@example.com");
    await expect(verify(altered)).rejects.toThrow();
  });
  it("rejects duplicate subject and From headers even when signed", async () => {
    await expect(verify(await signed(`Subject: other\r\n${message}`))).rejects.toThrow();
    await expect(
      verify(await signed(`From: Mallory <other@example.com>\r\n${message}`)),
    ).rejects.toThrow();
  });
  it("requires a signed subject, strict domain alignment, and the full body", async () => {
    await expect(verify(await signed(message, { headerList: "from:to" }))).rejects.toThrow();
    await expect(
      verify(await signed(message, { signingDomain: "other.example.com" })),
    ).rejects.toThrow();
    await expect(verify(await signed(message, { maxBodyLength: 5 }))).rejects.toThrow();
  });
  it("rejects replay onto another name or challenge", async () => {
    const rawEmail = Buffer.from(await signed()).toString("base64");
    const other = Effect.runSync(emailClaim({ ...intent, name: "bob.eth" }));
    await expect(
      Effect.runPromise(verifyEmailDkim({ intent, rawEmail }, other, resolver)),
    ).rejects.toThrow();
  });
  it("rejects expired and future-dated DKIM signatures", async () => {
    await expect(
      verify(
        await signed(message, {
          signTime: new Date(Date.now() - 60_000),
          expires: new Date(Date.now() - 1000),
        }),
      ),
    ).rejects.toThrow();
    await expect(
      verify(await signed(message, { signTime: new Date(Date.now() + 60_000) })),
    ).rejects.toThrow();
  });
  it("treats temporary DNS failure as unavailable, not verified", async () => {
    const rawEmail = Buffer.from(await signed()).toString("base64");
    await expect(
      Effect.runPromise(
        verifyEmailDkim({ intent, rawEmail }, claim, async () => {
          throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
