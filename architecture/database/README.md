# Database Catalog

Drizzle schemas in `packages/database/src/schema/` and generated migrations are the
executable source of truth. PostgreSQL stores timestamps with time zones; protocol
models decode driver values as `Date` objects at the repository boundary.

## auth_challenges

| Column             | Type        | Nullable | Constraint/default                 |
| ------------------ | ----------- | -------- | ---------------------------------- |
| id                 | uuid        | No       | Primary key; application-generated |
| nonce_hash         | text        | No       | Unique SHA-256 digest              |
| browser_token_hash | text        | No       | Browser-binding digest             |
| message            | text        | Yes      | Exact prepared SIWE message        |
| attempts           | integer     | No       | Default 0                          |
| created_at         | timestamptz | No       | Application clock                  |
| expires_at         | timestamptz | No       | Five-minute challenge deadline     |
| consumed_at        | timestamptz | Yes      | Set once on successful consumption |

Index: `auth_challenges_expiry_idx(expires_at)`. No foreign keys. No PostgreSQL enums.
Repository updates enforce message immutability, five attempts and one-time consumption.
These transition rules are conditional queries, not database CHECK constraints.

## sessions

| Column         | Type        | Nullable | Constraint/default                 |
| -------------- | ----------- | -------- | ---------------------------------- |
| id             | uuid        | No       | Primary key; application-generated |
| token_hash     | text        | No       | Unique session-token digest        |
| wallet_address | text        | No       | Checksummed Ethereum address       |
| chain_id       | integer     | No       | Protocol requires 11155111         |
| created_at     | timestamptz | No       | Session issue time                 |
| expires_at     | timestamptz | No       | Deadline from signed SIWE message  |
| revoked_at     | timestamptz | Yes      | Set on logout/rotation             |

Index: `sessions_expiry_idx(expires_at)`. No foreign keys. Addresses and chain ID are
validated by protocol models, not SQL CHECK constraints. No raw token is stored.

## Transactions And Lifecycle

`TransactionService.run` installs a private transaction client in Effect context.
Both repositories resolve it through `transactionOrDatabase`; nested calls reuse it.
Application sign-in wraps challenge consumption, session insert, and predecessor
revocation in one transaction. RPC and signature verification run before this boundary.

Active lookups require unexpired, unconsumed/unrevoked rows. Expired rows are retained
until maintenance deletes them; retention is not an authorization mechanism.
Database failures map to `DatabaseError` without exposing SQL, parameters or credentials.

The dedicated integration database must end in `_test`. Tests clear only its auth tables.
Schema reorganization preserves SQL table names and does not require a new migration.
Server startup and the migration CLI use the same advisory lock and apply only pending
migrations. The HTTP listener starts only after migration success. Keep the committed
`migrations/` directory beside the built database package in deployment artifacts.
