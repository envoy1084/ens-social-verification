import type { EmailIntent } from "../schema/email.js";
import type { VerificationClaim } from "../schema/verification.js";
import { createVerificationClaim } from "./claim.js";
import { hashVerificationClaim } from "./typed-data.js";

export const emailMethod = "email.dkim.v1";
export const emailRecordKey = "email";
export const emailVerificationKey = "verification[text][email]";

export function emailTarget(intent: EmailIntent) {
  return `email:${intent.email}:challenge:${intent.id}:recipient:${intent.recipient}`;
}

export function emailClaim(intent: EmailIntent) {
  return createVerificationClaim({
    name: intent.name,
    authority: intent.authority,
    recordKey: emailRecordKey,
    value: intent.email,
    method: emailMethod,
    target: emailTarget(intent),
    issuedAt: intent.issuedAt,
    validUntil: intent.validUntil,
  });
}

export function emailSubject(claim: VerificationClaim) {
  return `ENS verification ${hashVerificationClaim(claim)}`;
}
