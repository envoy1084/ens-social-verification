# OAuth Attestations

The shared OAuth engine uses `openid-client` for authorization code exchange with
S256 PKCE, state checking, confidential-client authentication, and protected identity
requests. Discord requests only `identify`. Telegram uses OIDC with `openid profile`;
its bot represents the login app but does not need a running bot process or webhook.
Neither integration requests messaging, phone, email, or refresh-token access.
Providers without PKCE are not supported.

Telegram identity comes from the ID token, not a UserInfo endpoint. `openid-client`
validates issuer, client audience, expiry and nonce, with non-repudiation checks enabled
to verify the RS256 signature against Telegram's fixed JWKS endpoint. Other algorithms
are rejected. A domain-separated SHA-256 digest of the private PKCE verifier is the
nonce, so it is bound to the existing session/attempt without a database migration.
Missing tokens or missing public usernames fail closed. Tokens are never published
or stored; public proofs contain only the selected identity and our attestation.

## Trust And Proof Format

`oauth.attestation.v1` is an application-defined experimental method, not a ratified
ENSIP method. Unlike the public-post methods, verifiers trust this service's attestor
to report the provider's authenticated identity correctly. OAuth access tokens are
not public cryptographic identity proofs.

The public envelope contains an ENSv2 claim, the authority's EIP-712 signature, and
an attestor signature. The claim binds the ENS name, provider record key, exact username,
provider, issuer, stable account subject, attempt UUID, authority and expiry. The
attestor signs the claim digest and canonical proof URL. Consumers must independently
configure the trusted signer; the address inside the proof is not a trust anchor.
The server currently trusts one configured signer. Rotating its key invalidates old
attestations; a multi-key trust policy is deliberately outside the hackathon scope.

Verification checks live ENS records and ENSv2 authority, both signatures, lifetime,
provider binding, canonical proof origin, and stored revocation status. The attestation
describes the username at authorization time, not a continuously checked social handle.
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
   The callback URL identifies the provider so only its card resumes the attempt.
   Attempt errors never override a verified attestation; successful saves clear the
   callback parameters. Legacy URLs without a provider require reconnecting.
5. ENSForge `useSendCalls` submits one resolver `setTexts` call containing the provider
   record (`com.discord` or `org.telegram`) and its `verification[text][...]` companion.
   Only the connected wallet sends transactions.
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

For Telegram, set `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET` and
`TELEGRAM_REDIRECT_URI`. In BotFather's mini app, switch Login Widget to OpenID Connect
Login, keep RS256, and register `/verification/oauth/telegram/callback` on the local
or production backend origin as an exact Redirect URI. Use the OIDC client secret,
not the bot API token. Trusted Origins are unnecessary for the server-side exchange.
The existing attestor key signs both providers; no additional funded wallet is needed.

To add another OAuth provider, register fixed HTTPS endpoints, issuer, scopes, record
key and response decoder in `application/src/oauth/providers.ts`; add its own credentials
to the config map. OIDC providers use a fixed JWKS URI; OAuth-only providers use a fixed
identity endpoint. Add its presentation and authorization destination to the web provider
registry and mount `OAuthVerification`. Never reuse another provider's credentials.
No provider-specific database tables or new proof method are required. Arbitrary user-
supplied endpoints and dynamic discovery are intentionally prohibited.

Tests use real Postgres, wallet and attestor signatures, and the real `openid-client`
exchange with mocked provider HTTP responses. Telegram tests use real RSA signatures
and reject forged signatures, wrong issuer/audience/nonce, expired tokens, missing tokens
and missing usernames. Integration tests cover provider mixups, publication and removal.
Live consent and wallet transactions require a manual smoke test with the configured apps.
Callback diagnostics log cookie-presence flags for pre-exchange rejection and fixed,
sanitized credential/code/ID-token failure messages after exchange. Provider response
descriptions, authorization codes, tokens, cookies and private claims are never logged.
