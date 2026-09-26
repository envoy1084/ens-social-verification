# X Proof Posts

Experimental `x.post.v1` with `a=2` on Sepolia ENSv2. Records are `com.twitter`
and `verification[text][com.twitter]`. The wallet signs; the server never submits
ENS transactions or signs an operator attestation. X's HTTPS API establishes post
authorship and current account identity, not a cryptographic signature from X.

## Flow

1. The authenticated current ENS owner starts a 15-minute OAuth attempt at
   `POST /verification/x/start`. Random state and PKCE are bound to that exact
   wallet session. An HttpOnly cookie carries the verifier; one pending X flow per
   browser is supported. OAuth scopes are `users.read tweet.read tweet.write`.
2. `GET /verification/x/callback` conditionally consumes the pending attempt before
   exchanging the code. It checks scopes, token lifetime, a public account, session
   and current ENS ownership. Only a UUID returns to the profile as `xAttempt`;
   OAuth tokens and codes never enter frontend responses.
3. The frontend fetches the prepared claim and previews the exact post before
   explicit approval. The EIP-712 claim binds name, record value, ENS authority,
   seven-day-or-ENS-expiry deadline and target `x:user:{id}:proof:{attemptUUID}`.
   Handles are lowercase; the stable X ID prevents handle recycling.
4. `POST /verification/x/attempts/:id/publish` rechecks the owner's signature,
   current authority and OAuth account, then atomically reserves publication.
   The post text is exactly `xProofPost(claim)`: a fixed heading and the EIP-712
   digest from `hashVerificationClaim`. It fits an ordinary post without URLs,
   truncation, t.co rewriting or a premium account. Each attempt has a distinct
   signed target, allowing one X account to verify multiple ENS names.
5. The immutable public envelope contains claim, wallet signature, X ID/handle,
   attempt UUID and post ID. It is served at `GET /verification/x/proofs/:id`.
   The descriptor points to this HTTPS API URL; proof storage is an availability
   dependency, not an authority. ENSForge submits both records in one resolver
   multicall, with simulation and wallet confirmation.
6. `GET /verification/x/status?name=...` reads live ENS authority and records,
   checks the wallet signature/expiry, and retrieves the post and account using
   the server's read-only app bearer token. Author ID, exact commitment text,
   unedited post history, public account and current handle must all match.
   Dependency failures yield 503, never a verified verdict.

## Persistence And Failure Boundaries

`x_attempts` stores session/state digests, PKCE challenge, encrypted temporary token,
identity, claim and expiry. States are pending, processing, ready and publishing.
Conditional transitions reject callback replay and concurrent post creation.
`x_publications` stores one immutable envelope/post ID per attempt.

Successful repeated publish calls return the same publication. A timeout/crash after
reservation is ambiguous: a post may exist without a stored result. We never retry
that remote write automatically. Check the X account before starting another attempt.
If only the ENS write fails, reuse the saved publication within the attempt window.
The callback URL retains the attempt ID so refreshing can recover it while unexpired.
The UI compares both records and skips already-completed writes on retry.

This deployment only accepts its configured proof origin and reads the local
database; descriptor URLs never cause arbitrary outbound requests. An independent
verifier can fetch the public envelope and reproduce the commitment, signature,
X identity and ENS authority checks. Changing API origins requires updating records.

## Removal

The owner confirms clearing both ENS records. An optional checkbox permanently
deletes the proof post using the same session's unexpired OAuth token. The backend
rechecks current ENS ownership, both empty records, X identity, author and unedited
post contents before deletion. No app bearer token is ever used for a write.
Expired access or failure keeps the post and reports partial success without
resending an ENS transaction. The hosted envelope is retained; without its matching
public post it cannot verify. Clearing records alone is not permanent revocation.

## Configuration

Server-only variables:

- `X_CLIENT_ID`, `X_CLIENT_SECRET`: OAuth 2.0 confidential Web App credentials.
- `X_BEARER_TOKEN`: app-only public account/post reads.
- `X_REDIRECT_URI`: exact registered backend callback URL.
- `X_TOKEN_ENCRYPTION_KEY`: 32 random bytes in lowercase hex, AES-256-GCM with
  attempt-bound authenticated data. Not an Ethereum signing key.
- `PUBLIC_SERVER_URL`: existing HTTPS public API origin.

Local callback: `http://localhost:8080/verification/x/callback`.
Production callback: `https://api.ethtokyo.envoy1084.xyz/verification/x/callback`.
Local View proof links use the loopback `VITE_SERVER_URL`; descriptors keep HTTPS.
API credit/billing failures are unavailable errors. No `offline.access`, refresh
token, email, direct-message permission or OAuth 1.0a key is needed.
Temporary token ciphertext is cleared within one minute of the 15-minute expiry.
Expired attempts and public proofs remain until maintenance. Loss of tokens does
not revoke the X OAuth grant; users manage that grant in X settings.

POSTs require the exact frontend Origin. OAuth callback navigation is exempt but
requires session, state and PKCE. Responses are no-store, requests bounded to 16 KiB,
provider responses to 128 KiB, and provider fetches to ten seconds with no redirects.
Per-process rate limits are 60 requests/minute and five concurrent; add shared
gateway limits before public deployment.

## Verification

Focused tests cover commitment binding, OAuth scopes and credential separation,
billing/rate-limit errors, encryption, session/owner/origin checks, replay, expiry,
signature failures, publication races, ambiguous writes, edits/renames/transfers,
public proofs and optional deletion. Integration tests use real PostgreSQL and
wallet signatures with controlled X and chain providers. Live OAuth/post creation
and wallet transactions remain a user-driven check after X billing is enabled.
