# Farcaster Verification

Experimental `farcaster.siwf.v1`, `a=2`, using `xyz.farcaster` and
`verification[text][xyz.farcaster]`. ENS ownership, wallet authentication and writes
remain Sepolia-only. Farcaster custody and auth-address authorization are read from
Optimism mainnet through Alchemy. No operator signature or posting key is involved.

## Flow

1. An authenticated owner calls `POST /verification/farcaster/start` with the ENS
   name. A session-bound attempt lasts 15 minutes. Its public intent contains a UUID,
   normalized name, authority, application domain/URI, issue time and proof expiry
   (seven days or ENS expiry, whichever is earlier).
2. The browser uses `@farcaster/auth-client` to open a relay channel and display a
   QR code/deep link. Channel credentials stay in browser memory, never in the proof
   or database. Approval expires after five minutes of polling; cancel prevents any
   subsequent completion, signing or writing from that flow. The library's existing
   relay poll may continue until its bounded timeout after cancellation.
3. The SIWF nonce is the hex Keccak hash of an ABI-encoded intent, domain-separated
   by method, record key, authority version and ENS chain ID. `requestId` is the attempt
   UUID; URI and expiration must match the intent exactly. Farcaster's signed FID
   resource authenticates the social identity, not unsigned relay profile metadata.
4. `POST /verification/farcaster/attempts/:id/complete` checks the SIWF signature,
   current custody or registered auth-address authorization, name ownership and
   session. A conditional database update fixes the evidence/claim once; retries
   with the exact approval return the same claim. Different approvals are rejected.
5. The ENS wallet signs the standard verification EIP-712 claim. Its target is
   `farcaster:fid:{fid}:siwf:{keccak256(message)}`. This binds the ENS signature to
   the exact Farcaster approval; the SIWF nonce binds that approval back to the ENS
   name and authority. The record value hash binds the handle or FID value.
6. `POST /verification/farcaster/attempts/:id/publish` rechecks both signatures,
   ownership, account and expiry, then atomically stores an immutable envelope.
   Concurrent/repeated publication returns the original proof. The proof is publicly
   available at `GET /verification/farcaster/proofs/:id`, without session metadata.
7. ENSForge `useSendCalls` submits one `setTexts.call` with both records. A rejected
   wallet transaction can reuse the publication while the page remains open. Before
   retrying, the UI reads both records and skips a write already completed.
8. `GET /verification/farcaster/status?name=...` checks current ENS records/authority,
   both signatures, current Farcaster signer authorization, handle mapping and
   expiry. Publication alone never grants a verified badge; dependency errors are 503.

## Names And Trust

Standard FNames are checked against the current transfer at
`https://fnames.farcaster.xyz/transfers/current?name=...`. The returned `to` FID must
match the signed FID. This is an HTTPS registry dependency for current handle
ownership, not a cryptographic assertion in relay metadata. A rename/reassignment
invalidates verification for that handle. Account signatures are independently
verified with Farcaster's Auth Client and current Optimism registry state.

ENS-style Farcaster usernames require separate resolution that is not implemented.
These accounts are still supported using `fid:{id}` as the record value, displayed
as `FID {id}`. This verifies the account, not the unverified ENS-style handle.

This deployment checks only proof URLs under its configured `PUBLIC_SERVER_URL`.
It retrieves their immutable envelope from PostgreSQL, then verifies its evidence;
it never fetches arbitrary descriptor URLs. Other verifiers can retrieve the public
envelope and reproduce the same checks using the shared schema/nonce/target helpers.
Proof hosting is an availability dependency, not a signing authority. Migrating
hosts or restoring a database without these envelopes requires updating records.

## Removal And Recovery

An owner can click Verified and confirm clearing both Farcaster records in one
transaction. This does not revoke the Farcaster account or delete the signed public
envelope. Restoring the records can reactivate an unexpired proof. No Farcaster
OAuth token or gist exists to delete. Pending state is not persisted in browser
storage; after refresh, start another attempt if no records were saved yet.
One FID can verify multiple ENS names using separate intent-bound proofs.

## Configuration And Limits

`APP_ORIGIN` determines SIWF domain/URI; `PUBLIC_SERVER_URL` is the HTTPS API origin
written into descriptors. Local development uses the local API for reads/writes,
but external proof readers need the public origin to serve the same database.
Deploy or tunnel that backend before sharing proof URLs publicly.
Enable **Optimism Mainnet** for the existing `ALCHEMY_API_KEY`. No Farcaster app
registration, API secret or public browser Alchemy key is required.

POSTs require the configured Origin and initiating authenticated session. Bodies
are capped at 16 KiB. Per-process limits are 60 requests/minute and five concurrent;
add gateway limits before public deployment. Provider checks time out, reject
redirects for FName retrieval and cap FName responses at 16 KiB. Failures never
produce a positive verdict or trigger a wallet transaction automatically.

Integration tests use PostgreSQL, real SIWF/EIP-712 signatures and controlled chain
and FName state. Live Farcaster consent and wallet transactions require user approval.
