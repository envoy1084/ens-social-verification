# Server

Effect v4 HTTP server. Run `pnpm --filter @ens-social-verification/server dev`.
Set `ALCHEMY_API_KEY` in `.env`; `HOST` defaults to `127.0.0.1`, `PORT` to `8080`.
Set `DATABASE_URL` and `APP_ORIGIN` in the same file. Both `dev` and `start` apply
advisory-locked migrations before listening; migration failures prevent startup.

`src/index.ts` launches `layers/server.ts`. Live services belong in `layers/services.ts`,
transport policy in `middlewares/`, cookie/body adaptation in `helpers/`, and handlers
in `routes/`. See [runtime architecture](../../architecture/platform/runtime.md).

- `GET /health`: process liveness.
- `GET /` and `GET /openapi.json`: generated OpenAPI specification.
- `GET /reference`: bundled Scalar API reference.
- `GET /health/ready`: configuration readiness, not an Alchemy connectivity probe.
- `POST /rpc/:chainId`: Alchemy JSON-RPC proxy for Sepolia (11155111) only. Mainnet is rejected.

The proxy accepts read/estimation methods, batches of up to 20, 64 KiB requests and
2 MiB responses. Transaction signing/sending belongs to the connected wallet.
Limits are per-process: 120 HTTP requests/minute and 10 concurrent requests.
The browser coalesces concurrent reads into batches of up to 20 with a 16 ms window.
Rate-limit responses include `Retry-After` so clients can wait for capacity.
Before public deployment add gateway rate limits; CORS is not access control.
The browser calls this server directly through `VITE_SERVER_URL`. No browser Alchemy key is required.

`pnpm --filter @ens-social-verification/server test` runs isolated proxy tests without credentials.

## Authentication

The backend is ready for RainbowKit's [custom authentication adapter](https://rainbowkit.com/docs/custom-authentication).
The frontend adapter is wired in `apps/web/src/auth`. It calls `${VITE_SERVER_URL}/auth/...` with
`credentials: "include"`. CORS permits only `APP_ORIGIN`. Use localhost for both local
hosts and same-site HTTPS sibling domains in production; no frontend proxy is needed.

| Route                | Request                                 | Response                                 |
| -------------------- | --------------------------------------- | ---------------------------------------- |
| `POST /auth/nonce`   | No body                                 | `{ nonce }` and browser-binding cookie   |
| `POST /auth/message` | `{ address, chainId: 11155111, nonce }` | `{ message }`                            |
| `POST /auth/verify`  | `{ message, signature }`                | Session DTO and session cookie           |
| `GET /auth/session`  | Session cookie                          | `{ address, chainId, expiresAt }` or 401 |
| `POST /auth/logout`  | Session cookie                          | 204; revokes session and clears cookies  |

Adapter mapping: `getNonce` -> nonce; async `createMessage` -> message; `verify` ->
verify; `signOut` -> logout. Sign the returned message verbatim. Read session on initial
load and clear frontend auth state when the wallet account or chain changes.

Every POST requires an exact `Origin: APP_ORIGIN` match. The server owns SIWE domain,
URI, nonce and timestamps; forwarded host headers are not trusted. JSON bodies are
limited to 16 KiB. Auth has a separate per-process limit of 120 requests/minute,
10 concurrent requests, and five signature attempts per challenge.

Challenges expire after five minutes and are browser-bound. The signed SIWE expiry
sets the session deadline, 24 hours from challenge creation. A challenge's message
cannot be replaced after preparation. Verification consumes it atomically with session
creation and rotation of the previous session. Invalid signatures do not create sessions.
Only credential hashes are stored (the public nonce also appears in the stored SIWE message).

Cookies are HttpOnly, SameSite=Lax, host-only and path `/`. HTTPS deployments use Secure
`__Host-` cookie names. HTTP is accepted only for localhost in development. All auth
responses are `no-store`; errors never include provider credentials or database details.
Alchemy is used to distinguish EOAs, EIP-7702 accounts and deployed ERC-1271 wallets
on Sepolia. Delegated accounts support both own-key and ERC-1271 signatures. Undeployed
ERC-6492 wallets are not supported. Provider outages return 503 rather than invalid-signature errors.

Authentication proves wallet control, not ENS ownership or permission to edit records.
Before public deployment add gateway limits and periodic deletion of expired challenge/session
rows. Expired rows are already rejected on reads. Contract-wallet sessions are not automatically
revoked on owner changes; add revalidation before sensitive future operations.

## GitHub

Set the GitHub OAuth credentials and token encryption key from `.env.example`.
Routes under `/verification/github/` implement start/callback, private attempts,
signed-gist publication and public verification status. No operator signing key or
ENS transaction writer is needed. See [the flow and production domains](../../architecture/github.md).

## Farcaster

Farcaster routes under `/verification/farcaster/` provide start, completion,
publication, public proof retrieval and live status. Set `PUBLIC_SERVER_URL` to the
public HTTPS API origin and enable Optimism Mainnet for `ALCHEMY_API_KEY`. The
browser RPC proxy remains Sepolia-only. See [Farcaster](../../architecture/farcaster.md).

## X

X routes under `/verification/x/` support OAuth/PKCE, signed-proof publication,
public proof retrieval, live status and optional post deletion. Set the OAuth 2.0
`X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_BEARER_TOKEN`, `X_REDIRECT_URI` and
`X_TOKEN_ENCRYPTION_KEY`. No OAuth 1.0a credentials are used.
See [X configuration and failure boundaries](../../architecture/x.md).

## Email

Set `RESEND_API_KEY` and `EMAIL_VERIFICATION_RECIPIENT` for a dedicated Resend
receiving subdomain. `/verification/email/` provides challenge creation, polled
receipt, private raw-message preview, consent-gated publication, status, and removal.
No webhook or outbound email is used. See [DKIM email](../../architecture/email.md)
for DNS setup, proof disclosure, supported signatures, and retention.

## Generic OAuth

Discord and Telegram use the shared `/verification/oauth/` routes with code + S256
PKCE. Configure each provider's `*_CLIENT_ID`, `*_CLIENT_SECRET`, `*_REDIRECT_URI`
and the shared dedicated `OAUTH_ATTESTOR_PRIVATE_KEY`. Discord uses `identify`;
Telegram uses `openid profile` and validates signed ID tokens, including nonce.
Tokens are not stored. This method trusts the backend attestor, unlike public-post flows.
See [OAuth architecture](../../architecture/oauth.md) for trust, expiry and removal.

## Sponsored Updates

Optional `PIMLICO_RPC_URL` and `PIMLICO_SPONSORSHIP_POLICY_ID` enable authenticated
Sepolia HCA sponsorship. The key remains server-side. Configure spending limits in
the Pimlico policy before deployment. See [sponsorship](../../architecture/sponsorship.md)
for setup permissions, the RPC allowlist and pending-operation recovery.

## Database Tests

Override `DATABASE_URL` for test commands with a separate database ending in `_test`.
Do not change the development URL in `apps/server/.env`:

```sh
node scripts/compose.ts exec postgres createdb -U ens_social ens_social_test
DATABASE_URL=postgresql://ens_social:YOUR_PASSWORD@localhost:5432/ens_social_test pnpm --filter @ens-social-verification/database db:migrate:test
DATABASE_URL=postgresql://ens_social:YOUR_PASSWORD@localhost:5432/ens_social_test pnpm exec turbo run test:integration
```

Tests clear auth tables only in that test database. They use real Postgres and real
EOA signatures; only the chain RPC transport is substituted. Integration results are
never cached. `pnpm check` runs the infrastructure-independent checks.
The [auth architecture](../../architecture/auth/README.md) owns the cross-package flow
and security invariants; the [table catalog](../../architecture/database/README.md)
owns persistence details.

Build the VPS image from the repository root with
`docker build -f apps/server/Dockerfile -t ens-social-server .`.
See [container deployment](../../architecture/platform/deployment.md) for runtime variables.
