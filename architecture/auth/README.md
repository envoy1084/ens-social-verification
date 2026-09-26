# Wallet Authentication

Implements [SIWE / EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) for the
[RainbowKit custom adapter](https://rainbowkit.com/docs/custom-authentication).
Sepolia (`11155111`) is the only accepted chain. Authentication establishes wallet
control; it does not authorize ENS record writes or prove social account ownership.

## Request Flow

1. `POST /auth/nonce` creates a five-minute challenge and sets an HttpOnly browser
   binding. Response: `{ nonce }`. A new request replaces the browser's pending binding.
2. `POST /auth/message` accepts `{ address, chainId, nonce }`. The server checks the
   binding and expiry, then constructs the SIWE message from trusted configuration.
   Domain, URI, issue time, statement and expiry are server-owned. The exact message
   is persisted once; retries for the same address return the same message.
3. The wallet signs those exact bytes. `POST /auth/verify` accepts `{ message, signature }`.
   The server matches the stored message, reserves one of five attempts, and checks
   account code on Sepolia. EOAs use message recovery; deployed contracts must return
   the ERC-1271 magic value for the message hash and signature. Exact EIP-7702
   delegation indicators permit own-key recovery first, then ERC-1271 at the
   account address. The delegate implementation address is never treated as signer.
4. After verification, an application-owned transaction conditionally consumes the
   challenge, inserts the new session, and revokes the browser's previous session.
   Repositories resolve the same transaction context. Concurrent replay loses the
   conditional update; a failed insert rolls back consumption.
5. The response sets the session cookie and clears the challenge cookie. The JSON DTO
   contains only `{ address, chainId, expiresAt }`. `GET /auth/session` restores that
   state; `POST /auth/logout` revokes it and clears both cookies, returning 204.

The SIWE expiration sets the session deadline: 24 hours from challenge creation.
The challenge itself must be completed within five minutes. These are distinct
limits. Verification performs RPC before opening the transaction and rechecks expiry
using the database clock when consuming the challenge.

## Security Boundaries

- Every POST requires the exact configured Origin. Forwarded host/IP headers cannot
  choose a sign-in domain or bypass the process budget. Cross-site requests are rejected.
- The nonce alone is insufficient: its separate browser-binding cookie is also required.
  Wrong bindings, altered messages, consumed/expired challenges and invalid signatures
  produce generic 401 responses. Malformed input or non-Sepolia chains produce 400.
- Signatures are verified, not stored. Browser/session tokens are random 256-bit values;
  the database stores domain-separated SHA-256 hashes. The public nonce is additionally
  present inside the exact stored SIWE message.
- Cookies are host-only, HttpOnly, SameSite=Lax and path `/`. HTTPS uses Secure
  `__Host-ens-session` and `__Host-ens-challenge`; local HTTP uses unprefixed names.
- Auth responses are `no-store`. JSON bodies are limited to 16 KiB with a five-second
  read deadline. Auth allows 120 requests/minute and ten concurrent requests per process.
- Alchemy requests have no retries and a ten-second deadline. Outages produce 503;
  ERC-1271 rejection produces 401. Unexpected defects are not converted to success.

See the [table catalog](../database/README.md) and
[application flow](../../packages/application/src/auth/index.ts).

## Frontend

`apps/web/src/auth/client.ts` generates an Effect HttpApi client from the API package,
with credentialed requests and bounded timeouts. React Query holds the public session
DTO in memory; it is not a second credential store. A missing/expired session (401)
is unauthenticated, while transport failures display a retry action.

The RainbowKit adapter requests server-generated messages and signs them verbatim.
Every signing retry uses a fresh challenge. Success requires both verification and a
cookie-backed session read. Its provider restores on mount/focus/reconnect, refreshes
once per minute while visible, and clears state at the session deadline. Authentication
is shown only when the session address and Sepolia chain match the connected wallet.

Account/chain/connector changes and disconnect invalidate pending sign-in results.
Logout waits for an in-flight verification before revoking the cookie it may set;
duplicate logout callbacks share that request. A failed logout blocks new sign-in and
session restoration until the user retries successfully. These guards coordinate one
tab; the backend remains the authority across tabs and requests.

## Verification

Real Postgres tests cover sign-in/session/logout, cookie flags, origin/browser binding,
wrong chain/message/signature, concurrent replay, rotation, attempts, expiry, rollback,
contract-wallet responses, upstream failure, payload bounds and rate limits. No web
test suite is added. A live Alchemy smoke check is separate from deterministic tests.

## Pending

ENS write authorization and social verification are separate features.
Undeployed ERC-6492 accounts are unsupported. Existing contract-wallet sessions
are not invalidated by onchain owner changes; future sensitive operations need revalidation.
Before public deployment add gateway limits and expired-row cleanup. No user/account table
is necessary until identities beyond a single wallet session are introduced.
