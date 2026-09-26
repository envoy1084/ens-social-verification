# OAuth Attestations

The shared OAuth engine uses `openid-client` for authorization code exchange with
S256 PKCE, state checking, confidential-client authentication, and protected identity
requests. Discord is the first allowlisted adapter; it requests only `identify`.
No bot, server installation, email access, public post, or refresh token is required.
This is an OAuth 2.1-style code flow, not a universal OIDC implementation: ID tokens
and OIDC nonce validation are not implemented. Providers without PKCE are not supported.

## Trust And Proof Format

`oauth.attestation.v1` is an application-defined experimental method, not a ratified
ENSIP method. Unlike the public-post methods, verifiers trust this service's attestor
to report the provider's authenticated identity correctly. OAuth access tokens are
not public cryptographic identity proofs.

The public envelope contains an ENSv2 claim, the authority's EIP-712 signature, and
an attestor signature. The claim binds the ENS name, `com.discord`, exact username,
provider, issuer, stable Discord user ID, attempt UUID, authority and expiry. The
attestor signs the claim digest and canonical proof URL. Consumers must independently
configure the trusted signer; the address inside the proof is not a trust anchor.
The server currently trusts one configured signer. Rotating its key invalidates old
attestations; a multi-key trust policy is deliberately outside the hackathon scope.

Verification checks live ENS records and ENSv2 authority, both signatures, lifetime,
provider binding, canonical proof origin, and stored revocation status. The attestation
describes the username at authorization time, not a continuously checked Discord handle.
Claims expire after seven days, capped by ENS authority expiry. Reconnect to renew.
Copied proofs still require an online revocation check; removing a proof does not erase
copies already downloaded or recorded in chain history.

## Flow

1. The signed-in owner's wallet starts a provider attempt. State is stored as a digest,
   the PKCE challenge is stored in Postgres, and the verifier is held in a 15-minute
   HttpOnly, host-only, SameSite=Lax cookie. Production cookies are Secure.
2. The provider redirects to the backend callback. A conditional database update
   consumes the matching provider/state/session/PKCE attempt exactly once. A second
   attempt replaces the browser's verifier cookie; return to the newest attempt.
3. The backend exchanges the code, fetches identity and discards tokens. It rechecks
   the session and ENS authority before preparing an immutable claim.
4. The frontend explains what becomes public. The wallet signs the claim; the backend
   validates it and publishes its signed attestation. Publication is idempotent.
5. ENSForge `useSendCalls` submits one resolver `setTexts` call containing `com.discord`
   and `verification[text][com.discord]`. Only the connected wallet sends transactions.
   A rejected transaction can reuse the publication while the attempt is still live.
6. Removal clears both records in the wallet, then revokes the public attestation.
   Revocation can be retried without a second transaction and cannot be undone by
   replaying publication. Private attempts expire after 15 minutes and are purged
   every five minutes; published attestation rows survive that cleanup.

## HTTP Contract

All paths are beneath `/verification/oauth`; schemas are in the shared API package
and appear in `/openapi.json` and `/reference`.

| Method | Path                         | Access                                      |
| ------ | ---------------------------- | ------------------------------------------- |
| GET    | `/:provider/configuration`   | Public readiness and trusted signer         |
| POST   | `/:provider/start`           | Same-origin owner session                   |
| GET    | `/:provider/callback`        | Session, state and PKCE binding             |
| GET    | `/attempts/:id`              | Creating session; unexpired attempt         |
| POST   | `/attempts/:id/publish`      | Same-origin session and authority signature |
| GET    | `/proofs/:id`                | Public, unless revoked                      |
| GET    | `/:provider/status?name=...` | Public live verification                    |
| POST   | `/:provider/removal`         | Current owner; both records already empty   |

## Configuration And Extension

Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`,
`PUBLIC_SERVER_URL` and `OAUTH_ATTESTOR_PRIVATE_KEY` in `apps/server/.env`.
The private key is a dedicated random Ethereum signing key, never a funded wallet.
Back it up securely and preserve it across deployments. Do not expose it to Vite.
The local callback is `http://localhost:8080/verification/oauth/discord/callback`;
production uses `https://api.ethtokyo.envoy1084.xyz/verification/oauth/discord/callback`.
Register the exact callback in Discord. Proof descriptors retain the canonical HTTPS
origin; development proof links open the equivalent localhost endpoint.

To add another OAuth provider, register fixed HTTPS endpoints, issuer, scopes, record
key and response decoder in `application/src/oauth/providers.ts`; add its own credentials
to config and select them in the transport. Never reuse Discord credentials for it.
Add its UI authorization-origin allowlist and card using the shared hook/removal dialog.
No provider-specific database tables or new proof method are required. Arbitrary user-
supplied endpoints and dynamic discovery are intentionally prohibited.

Tests use real Postgres, wallet and attestor signatures, and the real `openid-client`
exchange with mocked Discord HTTP responses. Live Discord consent and wallet transactions
require a manual smoke test with the configured app.
