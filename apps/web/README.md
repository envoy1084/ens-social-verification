# Web

TanStack Router + Vite, Namespace UIKit, ENSForge and RainbowKit.
Run `pnpm --filter @ens-social-verification/web dev` on port 3000 with the server on 8080.
Set `VITE_SERVER_URL=http://localhost:8080` locally. The browser calls that API origin
directly; Vite and Nginx do not proxy requests. Production static hosting needs only
an `index.html` fallback for client routes. The server allows credentialed CORS from
its exact `APP_ORIGIN`. Auth fetches must use `credentials: "include"`.

Injected browser wallets work without configuration. Optional settings are listed
in `.env.example`: WalletConnect project ID and the required public API origin.
Search uses ENSForge's `useSearchNames`; registration dates use `useIndexedName`.
ENSForge and wallets use Sepolia only (11155111), with ENSForge's default v2 indexer.
The v1 indexer is disabled. The indexer fetch adapter removes Effect's `b3` and
`traceparent` headers because the public endpoint's CORS policy does not allow them.
If the indexer is unavailable, exact-name navigation still works.
Alchemy credentials belong only to the server. No social verification is implemented yet.

Visual assets and layout follow the user's `ensip-url-verification/apps/demo` reference.
The ENS wordmark comes from https://ens.domains/brand; follow its trademark guidance before publishing.
Missing avatars use DiceBear shapes seeded with the public ENS name (then initials if unavailable).

Build the Nginx image from the repository root with
`docker build -f apps/web/Dockerfile --build-arg VITE_SERVER_URL=https://api.example.com -t ens-social-web .`.
The API URL is baked into the static bundle; rebuild to change it. See
[container deployment](../../architecture/platform/deployment.md).
