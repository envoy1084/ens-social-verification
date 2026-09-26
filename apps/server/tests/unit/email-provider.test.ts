import { Effect, Layer, Redacted } from "effect";

import { EmailConfig, EmailProvider } from "@ens-social-verification/application";
import { emailClaim, emailSubject } from "@ens-social-verification/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

const intent = {
  id: "f3b057a2-54b1-46ad-9466-9c20b4901f8b",
  name: "alice.eth",
  authority: "0x0000000000000000000000000000000000000001" as const,
  email: "alice@example.com",
  recipient: "verify@proof.example.com",
  issuedAt: "1700000000",
  validUntil: "1700604800",
};
const claim = Effect.runSync(emailClaim(intent));
const provider = EmailProvider.layer.pipe(
  Layer.provide(
    Layer.succeed(EmailConfig, {
      enabled: true,
      apiKey: Redacted.make("test-only"),
      recipient: intent.recipient,
      proofOrigin: "https://api.example.com",
    }),
  ),
);

function receive(downloadUrl: string, response: Response) {
  const download = vi.fn(async () => response);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.origin === "https://api.resend.com") {
      if (url.pathname === "/emails/receiving")
        return Response.json({
          has_more: false,
          data: [{ id: "test", subject: emailSubject(claim), to: [intent.recipient] }],
        });
      return Response.json({ raw: { download_url: downloadUrl } });
    }
    return download();
  });
  const result = Effect.runPromise(
    Effect.gen(function* () {
      return yield* (yield* EmailProvider).receive(intent, claim);
    }).pipe(Effect.provide(provider)),
  );
  return { result, download };
}

afterEach(() => vi.restoreAllMocks());

describe("original email downloads", () => {
  it("accepts Resend's CDN but still rejects unsigned evidence", async () => {
    const { result, download } = receive(
      "https://cdn.resend.app/raw/test",
      new Response("unsigned"),
    );
    await expect(result).resolves.toMatchObject({ evidence: null, reason: expect.any(String) });
    expect(download).toHaveBeenCalledOnce();
  });

  it.each(["https://cdn.resend.app.evil.test/raw", "http://cdn.resend.app/raw"])(
    "rejects untrusted download URL %s before fetching",
    async (url) => {
      const { result, download } = receive(url, new Response("unsigned"));
      await expect(result).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(download).not.toHaveBeenCalled();
    },
  );

  it("distinguishes oversized messages from provider failures", async () => {
    const { result } = receive(
      "https://cdn.resend.app/raw/test",
      new Response("x".repeat(256_001)),
    );
    await expect(result).rejects.toMatchObject({
      code: "INVALID_PROOF",
      message: expect.stringContaining("256 KB"),
    });
  });
});
