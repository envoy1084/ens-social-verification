# DKIM Email Verification

Experimental method `email.dkim.v1` uses `email` and `verification[text][email]`,
authority version 2, and the existing Sepolia wallet signature profile.

## Flow

1. An authenticated current ENS owner starts a 30-minute challenge for an email.
2. The server binds a random attempt ID, recipient, email, ENS name, authority, and
   seven-day claim lifetime (capped by ownership expiry) into an EIP-712 claim.
3. The user sends a new message to the receiving inbox. Its exact subject is
   `ENS verification <EIP-712 claim hash>`. No outbound mail or OTP is involved.
4. The browser polls completion every ten seconds while open. The server scans
   Resend's received-email list, downloads a matching original message, and checks
   DKIM. Resend's authentication verdict is not accepted as evidence.
5. Evidence stays session-private. The user can review the raw message, consents to
   public disclosure, and signs the claim. The server rechecks authority and DKIM
   before publishing an immutable envelope; it does not sign an attestation.
6. ENSForge `useSendCalls` batches both text records in the connected wallet.
   Rejected transactions can be retried without republishing. Status reads check
   live records, current authority, wallet signature, claim expiry, and DKIM again.
7. Removal clears both records in the wallet, then deletes the hosted proof after
   server-side confirmation. Downloaded copies and Resend's inbox are not deleted.

## Verification Profile

`verifyEmailDkim` is usable without Resend or the database. It recomputes the claim
from the evidence intent, checks its commitment in the signed subject, and uses
Mailauth with current DNS keys. It requires exactly one From mailbox and Subject,
exact mailbox identity, strict signing-domain alignment, SHA-256, valid signature
time constraints, signed From and Subject, and full-body coverage (no `l=`).
RSA keys must be at least 2048 bits; Ed25519 is supported. Quoted/Unicode mailbox
forms are outside this initial profile; local-part case is preserved.

DKIM authenticates a domain's assertion about a sender, not an independently held
mailbox key. The mail provider, domain administrators, and DNS remain trusted.
An operator cannot manufacture proof without their signing keys, but can withhold
or delete hosted evidence. DNS key rotation/removal can invalidate existing proofs;
this implementation does not archive trusted historical keys or use zero knowledge.

Raw messages contain personal data. The UI requires explicit publication consent
and offers a private source preview. Send a short dedicated message without a
signature or attachments. The app stores at most 256 KB and never renders raw HTML.
Proof reads and private endpoints are `no-store`; credentials and raw emails are
not logged. Hosting is restricted to this API's configured proof origin for now.

## API And Operations

Routes under `/verification/email`: POST `start`, POST `attempts/:id/complete`,
GET `attempts/:id/preview`, POST `attempts/:id/publish`, GET `proofs/:id`,
GET `status?name=...`, POST `removal`. Contracts appear in OpenAPI/Scalar.

Set `RESEND_API_KEY` with receiving access and `EMAIL_VERIFICATION_RECIPIENT` on a
Resend receiving subdomain. Keep the primary domain's Google Workspace MX records.
No webhook, Google API, Workspace alias, or additional seat is needed. The sending
domain must DKIM-sign outgoing mail. `PUBLIC_SERVER_URL` remains the public HTTPS
proof origin; local UI proof links use `VITE_SERVER_URL`.

Polling is request-driven, not a perpetual mailbox worker. It stops on completion,
error, navigation, or wallet change; retry explicitly after errors. Each scan covers
up to 1,000 recent messages and five candidates, and reports limits instead of
silently skipping history. Raw downloads are HTTPS-only on Resend/S3 hosts (including
Resend's `cdn.resend.app` original-message CDN), reject
redirects, and enforce a streamed size cap and timeout. A dedicated inbox is expected.
Private expired attempts are deleted every five minutes; published evidence persists
until removal. Current in-progress UI state is not restored after a page reload.

Tests use real DKIM signatures and PostgreSQL; only email/DNS and chain transports
are substituted. A real send from the user's mailbox and wallet transaction still
need a manual end-to-end check.
