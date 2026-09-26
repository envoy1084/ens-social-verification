# Architecture

Technical reference for the implemented hackathon backend. Package READMEs own local
commands; these documents explain cross-package flows, persistence, and security.

## Reading Order

1. [Repository boundaries](engineering/repository.md): folder ownership and dependency direction.
2. [Server runtime](platform/runtime.md): Layers, routing, configuration, and local services.
3. [Wallet authentication](auth/README.md): SIWE flow, cookies, transactions, and failure behavior.
4. [Database catalog](database/README.md): tables, indexes, and lifecycle invariants.
5. [Container deployment](platform/deployment.md): Node backend and Nginx frontend images.
6. [Record verification](verification.md): experimental ENSv2 authority and claim helpers.
7. [Signed GitHub gists](github.md): OAuth, wallet signatures, gist publication and ENS batching.
8. [Farcaster verification](farcaster.md): SIWF, FID/handle checks and public signed proofs.
9. [X proof posts](x.md): OAuth, public claim commitments, live checks and optional post deletion.
10. [DKIM email](email.md): Resend polling, private evidence, public consent, and signed ENS records.
11. [OAuth attestations](oauth.md): Discord OAuth, Telegram OIDC, attestor trust and revocation.
12. [Sponsored updates](sponsorship.md): optional HCA setup, Pimlico policy and transaction recovery.

The web app reads ENSv2 names on Sepolia.
Search performs a normalized exact-name indexer lookup alongside bounded prefix
suggestions, placing the exact match first and deduplicating results. Both lookups
require reachable v2 names; prefix ordering cannot push an exact name off the page.
If the exact entry is missing, one cached on-chain name-state lookup can include an
active v2 name before indexing catches up. Prefix suggestions never trigger chain
lookups. Searches are debounced and cached for one minute without polling.
The authentication backend verifies wallet control and issues browser sessions
through the RainbowKit adapter. Read-only record
verification helpers validate ENSv2 authority and claims. GitHub verification publishes
wallet-signed gists and batches the two ENS record updates in the connected wallet.

## Documentation Contract

- Update the owning document with changes to a contract, table, transaction, route,
  security rule, or runtime lifecycle.
- Describe implemented behavior in the present tense. Put missing work in `Pending`.
- Link to source boundaries; do not duplicate large implementation examples.
- Keep the database catalog synchronized with Drizzle schemas and migrations.
- Do not copy unrelated Namera domains into this project.
