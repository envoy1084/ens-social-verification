# Repository Boundaries

The workspace keeps two apps and four packages. Organization follows Namera's
domain folders without its billing, organizations, email, or delegated-wallet modules.

```text
apps/server/src/
  config.ts                 Listener and Alchemy configuration
  layers/                   Live services and HTTP runtime composition
  middlewares/              Shared auth origin, error, and rate-limit policy
  helpers/                  HTTP body decoding and cookie options
  routes/auth/              Wallet sign-in and session handlers
  routes/                   Health, RPC proxy, and API reference
apps/server/tests/
  fixtures/                 HTTP runtime with real persistence and substituted RPC
  integration/              Core PostgreSQL authentication flows
  unit/                     Isolated health, RPC, and OpenAPI tests
packages/protocol/src/
  schema/                   EthereumAddress, signatures, nonce and digest primitives
  model/auth/               Persistence models and insert schemas
  dto/auth/                 Public request and response schemas
  errors/                   Expected auth and database failures
packages/database/src/
  config.ts                 Redacted database configuration
  core/                     Database and transaction services
  migrations/               Locked startup and CLI migration runner
  schema/auth/              One Drizzle table per file
  repositories/auth/        Challenge and session query services
packages/application/src/auth/
  index.ts                  Authentication use cases and transaction boundary
  config.ts                 Trusted application origin
  signature-verifier.ts     Sepolia EOA and ERC-1271 verification
packages/api/src/routes/
  auth/                     Wallet/session HttpApi groups
  health.ts, rpc.ts         Public endpoint contracts
```

Dependency direction: `protocol <- database <- application <- server`; `api` depends
only on `protocol`. The server also imports `api` and composes infrastructure Layers.
The web app never imports database or application code.

Protocol import paths are `/schema`, `/model`, `/dto`, and `/errors`. Public HTTP
contracts use DTOs, not persistence models. Root exports retain the original public
schemas for compatibility but deliberately exclude persistence models.

Models validate repository inputs and reads; Drizzle owns SQL storage. Repositories
resolve the transaction context before using the normal database. Application code
coordinates multi-repository mutations without receiving a raw Drizzle transaction.

Add files when they own a distinct responsibility. No empty relation, worker, or
provider folders are needed until a feature actually uses them.
