# Signed GitHub Gists

Experimental `github.gist.v1`, with ENSv2 authority `a=2` on Sepolia only. There is
no operator key, operator signature, or operator attestation. The wallet signs the
ENS claim. GitHub's HTTPS API supplies the gist/account ownership evidence; GitHub
does not cryptographically sign the account identity.

## Flow

1. The current ENS owner signs in through SIWE. `POST /verification/github/start`
   checks live V2 authority and creates a 15-minute attempt bound to that exact
   session. The response sets an HttpOnly PKCE cookie and returns an authorization
   URL requesting only `gist` scope. Starting again replaces the browser's pending
   PKCE cookie; use one authorization flow at a time.
2. GitHub returns to `GET /verification/github/callback`. The session, random state,
   PKCE binding and expiry must match. A conditional update consumes the callback
   before exchanging the code. The server reads `/user`, requires gist permission,
   and rechecks the session and ENS owner. Provider failure requires a new attempt.
3. The attempt exposes the GitHub username/ID and the exact claim through its
   authenticated GET endpoint. Claims expire after seven days or ENS expiry,
   whichever comes first. `com.github` contains the lowercase username; `target`
   is `github:user:{numericId}`. Binding the stable ID prevents a new holder of a
   recycled username from reusing the signature. The user signs EIP-712 in their wallet.
4. `POST /verification/github/attempts/:id/publish` validates that signature against
   current authority, rechecks the OAuth account, and atomically reserves publication.
   The server creates a **public** gist named `ens-verification.json` on the user's
   account. It contains the claim, authority signature, GitHub ID and username.
5. The frontend uses ENSForge `useSendCalls` with one `setTexts.call` intent. This
   encodes both `com.github` and `verification[text][com.github]` into one resolver
   multicall, so an ordinary wallet also gets an atomic record update. ENSForge
   simulates, asks the wallet to send, and waits for confirmation. No backend writes
   or wallet transaction keys are used.
6. The badge comes from `GET /verification/github/status?name=...`, never from a
   publication row or transaction receipt. It checks the live descriptor/value,
   canonical gist, gist owner, current GitHub username/ID, current ENS authority,
   signature and expiry. Reassignment, transfer, deletion, editing or expiry makes
   the proof invalid. Dependency failures return 503, not a positive verdict.

## Proof Format

The descriptor is `ensrv1 a=2 m=github.gist.v1 u=https://gist.github.com/{login}/{id}`.
The gist must be public, not a fork, with a complete, untruncated proof file. Its
contents must exactly match `serializeGithubEnvelope`: UTF-8 JSON, two-space indent,
schema field order, no trailing newline or extra fields. This deliberately narrow
method rejects duplicate JSON members and ambiguous encodings before verification.
The proof holds `githubId` and `login`; those fields are checked against GitHub, not
treated as independently signed assertions. The authority-signed claim binds the
ENS name, wallet, exact record bytes and GitHub target.

Only canonical `gist.github.com` URLs are parsed. Retrieval uses the extracted hex
ID against a fixed `api.github.com/gists/{id}` endpoint, never the supplied URL or
`raw_url`. Redirects are rejected; requests have ten-second deadlines, API responses
are capped at 128 KiB, and the proof file at 64 KiB. Public verification requires no
local database row and can check a compatible gist created outside this server.

## Credentials And Recovery

Use a GitHub **OAuth App** with `gist` permission. No repository or email scopes are
requested. OAuth tokens are AES-256-GCM encrypted with attempt-bound authenticated
data while waiting for the wallet signature. The key is `GITHUB_TOKEN_ENCRYPTION_KEY`,
32 random bytes as lowercase hex; it is not an Ethereum signing key. Token ciphertext
is cleared when publication is reserved, or within one minute of attempt expiry.
Access tokens never appear in frontend responses, logs or public proofs. Discarding
the token does not revoke the user's GitHub OAuth grant; users can revoke it in GitHub.

Repeated successful publication calls return the same gist. Concurrent publication
requests cannot create multiple gists. A timeout/crash after reservation is ambiguous:
the gist may exist even if no publication row was saved. We do not retry that remote
write automatically. Check the user's gists, then start a new attempt. An unlinked
gist never grants verification. Rejected ENS transactions can reuse the published gist
within the attempt window; the descriptor remains visible in the public gist/ENS state.

The UI explicitly asks to publish the public proof. OAuth cancellation/failure returns
a retry page without leaking codes or state. Wallet/account/chain changes stop the
pending frontend workflow before subsequent signing or writing steps. API writes
require the exact configured frontend Origin; the callback is exempt only because
it is protected by the session, single-use state and PKCE cookie. All responses are
no-store. Each server process allows 60 GitHub requests/minute and five concurrent.
Add shared gateway limits before a wider public deployment. Unauthenticated GitHub
API quotas also limit public status checks; outages remove the UI's verified state.

## Deployment

- Frontend: `https://ethtokyo.envoy1084.xyz` (`APP_ORIGIN` on the server).
- Backend: `https://api.ethtokyo.envoy1084.xyz` (`VITE_SERVER_URL` at web build time).
- OAuth callback: `https://api.ethtokyo.envoy1084.xyz/verification/github/callback`.
- Local callback: `http://localhost:8080/verification/github/callback`.

Register the matching callback in GitHub and set `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`, and `GITHUB_TOKEN_ENCRYPTION_KEY`.
Missing configuration disables new GitHub connections without disabling wallet auth.
Production uses same-site HTTPS sibling domains so the session and PKCE cookies work
without a frontend proxy. Keep the local environment on localhost for development.

## Checks

Focused tests cover canonical proof/URI parsing, token encryption binding, real
PostgreSQL state transitions, session/origin/owner checks, callback replay, expiry,
bad signatures, concurrent publication, retry reuse, and changed onchain/GitHub
identity. Test GitHub and chain providers are controlled fixtures; live OAuth
consent and wallet transactions still require a user-driven browser run.
