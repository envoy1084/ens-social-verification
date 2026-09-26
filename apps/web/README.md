# Web

Search queries only the Sepolia V2 indexer and does not synthesize unverified name
suggestions. Profile routes check live name state before mounting record components;
V1, reserved and inactive names show a fallback, while lookup failures offer retry.
The ENSForge deployment excludes V1 fallback contracts.

TanStack Router + Vite, Namespace UIKit, ENSForge and RainbowKit.
Run `pnpm --filter @ens-social-verification/web dev` on port 3000 with the server on 8080.
Set `VITE_SERVER_URL=http://localhost:8080` locally. The browser calls that API origin
directly; Vite and Nginx do not proxy requests. Production static hosting needs only
an `index.html` fallback for client routes. The server allows credentialed CORS from
its exact `APP_ORIGIN`. The generated Effect API client includes credentials on all auth calls.

Injected browser wallets work without configuration. Optional settings are listed
in `.env.example`: WalletConnect project ID and the required public API origin.
Search uses ENSForge's `useSearchNames`; registration dates use `useIndexedName`.
ENSForge and wallets use Sepolia only (11155111), with ENSForge's default v2 indexer.
The v1 indexer is disabled. The indexer fetch adapter removes Effect's `b3` and
`traceparent` headers because the public endpoint's CORS policy does not allow them.
If the indexer is unavailable, exact-name navigation still works.
Alchemy credentials belong only to the server. GitHub verification uses OAuth to create
a public wallet-signed gist, then ENSForge `useSendCalls` submits one resolver multicall
for both text records. The badge requires live proof verification, not merely a receipt.
See [GitHub flow and deployment](../../architecture/github.md).
Farcaster uses a QR/deep-link approval through Auth Client, a public owner-signed
proof and the same atomic ENS write pattern. QR rendering uses `qrcode.react`;
Optimism credentials and signature verification stay on the server. See
[Farcaster flow](../../architecture/farcaster.md).
During Vite development with a loopback `VITE_SERVER_URL`, the signed-proof link
opens on that local API origin. The on-chain descriptor retains its public HTTPS URL;
production builds link directly to that public URL.

X uses OAuth followed by an explicit post preview and wallet signature. A public
post commits to the signed claim, and both ENS records are saved atomically.
Published proofs can be reused after a rejected transaction while the attempt is
unexpired. Owner removal optionally deletes the X post. See [X flow](../../architecture/x.md).

Discord and Telegram share `OAuthVerification`, with provider-specific icons, record
keys and authorization destinations. Both disclose attestor trust and public identity
fields before signing, batch record updates, and revoke proofs after removal. Telegram
requires a public username. See [OAuth flow](../../architecture/oauth.md).
Callback attempts are scoped by provider and removed from the URL after a successful
save. A stale setup attempt does not override a live verified attestation.
GitHub, X and OAuth callback parameters are also cleared when a reload or manual
recheck confirms verification. Unrelated search parameters are preserved; incomplete
attempts remain resumable. Farcaster and email do not use callback query parameters.

RainbowKit custom authentication is wired through `src/auth/`: `client.ts` uses the
shared API contracts, `adapter.ts` coordinates sign-in/logout, and `provider.tsx`
restores session state. Connecting a wallet prompts for the server-generated SIWE
message. The account menu appears only after verification and a cookie-backed session
read succeed. Reload/focus/reconnect restores the session; expiry clears it. Account,
chain and connector changes revoke the session, as does disconnecting. Failed logout
shows a retry action instead of silently restoring the old session. No credentials are
stored in localStorage. Vite resolves workspace source exports for live contract updates.
The connected button resolves its primary name and avatar through ENSForge on Sepolia.
It falls back to a shortened address and a locally generated avatar. Its fixed width
keeps long names from moving the navbar.

Visual assets and layout follow the user's `ensip-url-verification/apps/demo` reference.
The ENS wordmark comes from https://ens.domains/brand; follow its trademark guidance before publishing.
Missing or failed avatars use `DeterministicAvatar`, an ENS-style blue bar pattern
seeded by the normalized ENS namehash (or a hash of the lowercase wallet address).
Search, profiles and named wallets share the same pattern. SVGs are generated locally
without external image requests; this is not the official ENS avatar algorithm.

Build the Nginx image from the repository root with
`docker build -f apps/web/Dockerfile --build-arg VITE_SERVER_URL=https://api.example.com -t ens-social-web .`.
The API URL is baked into the static bundle; rebuild to change it. See
[container deployment](../../architecture/platform/deployment.md).
