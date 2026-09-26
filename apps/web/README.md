# Web

TanStack Router + Vite, Namespace UIKit, ENSForge and RainbowKit.
Run `pnpm --filter @ens-social-verification/web dev` on port 3000 with the server on 8080.
The Vite development/preview proxy forwards `/rpc` to `SERVER_URL`.
Production hosting must route `/rpc/*` to the server and other unknown paths to index.html.

Injected browser wallets work without configuration. Optional settings are listed
in `.env.example`: WalletConnect project ID and a public ENS subgraph endpoint.
Search uses ENSForge's `useSearchNames`; registration dates use `useIndexedName`.
Set `VITE_ENS_SUBGRAPH_URL` to override ENSForge's default mainnet indexer endpoint.
If the indexer is unavailable, exact-name navigation still works.
Alchemy credentials belong only to the server. No social verification is implemented yet.

Visual assets and layout follow the user's `ensip-url-verification/apps/demo` reference.
