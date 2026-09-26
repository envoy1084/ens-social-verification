import { Resolver } from "node:dns/promises";

import { Effect, Exit, Schema } from "effect";

import { emailClaim, emailSubject, hashVerificationClaim } from "@ens-social-verification/protocol";
import { EmailError } from "@ens-social-verification/protocol/errors";
import type { EmailEvidence, VerificationClaim } from "@ens-social-verification/protocol/schema";
import type { DNSResolver } from "mailauth";
import { dkimVerify } from "mailauth/lib/dkim/verify.js";

// Mailauth's runtime includes signed-header/body coverage absent from its public typings.
const SignatureResult = Schema.Struct({
  signingDomain: Schema.String,
  algo: Schema.String,
  status: Schema.Struct({ result: Schema.String }),
  signatureTimeValid: Schema.Boolean,
  canonBodyLengthLimit: Schema.optional(Schema.Number),
  signingHeaders: Schema.Struct({ keys: Schema.String }),
});

export const verifyEmailDkim = Effect.fn("verifyEmailDkim")(function* (
  proof: EmailEvidence,
  claim: VerificationClaim,
  resolver?: DNSResolver,
) {
  const expected = yield* emailClaim(proof.intent);
  if (hashVerificationClaim(expected) !== hashVerificationClaim(claim))
    return yield* new EmailError({
      code: "INVALID_PROOF",
      message: "Email challenge does not match this claim.",
    });
  const raw = Buffer.from(proof.rawEmail, "base64");
  if (raw.length > 256_000 || raw.toString("base64") !== proof.rawEmail)
    return yield* new EmailError({
      code: "INVALID_PROOF",
      message: "Email proof is too large or malformed.",
    });
  const dns = new Resolver({ timeout: 3000, tries: 2 });
  const result = yield* Effect.tryPromise({
    try: () =>
      dkimVerify(raw, {
        minBitLength: 2048,
        resolver: resolver ?? ((domain) => dns.resolveTxt(domain)),
      }),
    catch: () =>
      new EmailError({ code: "INVALID_PROOF", message: "Cannot parse the signed email." }),
  });
  const headers = result.headers?.parsed ?? [];
  const from = headers.filter((header) => header.key === "from");
  const subjects = headers.filter((header) => header.key === "subject");
  const subject = subjects[0]?.line
    .toString()
    .replace(/\r?\n[\t ]+/g, " ")
    .replace(/^subject:[\t ]*/i, "")
    .trim();
  if (
    from.length !== 1 ||
    subjects.length !== 1 ||
    result.headerFrom.length !== 1 ||
    result.headerFrom[0] !== proof.intent.email ||
    subject !== emailSubject(claim)
  )
    return yield* new EmailError({
      code: "INVALID_PROOF",
      message: "Send a new email from the exact address with the unchanged verification subject.",
    });
  let unavailable = false;
  for (const candidate of result.results) {
    if (candidate.status.result === "temperror" || candidate.status.result === "temperr")
      unavailable = true;
    const decoded = Schema.decodeUnknownExit(SignatureResult)(candidate);
    if (!Exit.isSuccess(decoded)) continue;
    const signature = decoded.value;
    const signed = new Set(
      signature.signingHeaders.keys
        .toLowerCase()
        .split(":")
        .map((key) => key.trim()),
    );
    if (
      signature.status.result === "pass" &&
      signature.signatureTimeValid &&
      signature.signingDomain.toLowerCase() === proof.intent.email.split("@")[1] &&
      ["rsa-sha256", "ed25519-sha256"].includes(signature.algo) &&
      signature.canonBodyLengthLimit === undefined &&
      signed.has("from") &&
      signed.has("subject")
    )
      return;
  }
  return yield* new EmailError({
    code: unavailable ? "UNAVAILABLE" : "INVALID_PROOF",
    message: unavailable
      ? "The sender's DKIM DNS key is temporarily unavailable."
      : "Email needs a valid, domain-aligned DKIM signature covering From, Subject, and the entire body.",
  });
});
