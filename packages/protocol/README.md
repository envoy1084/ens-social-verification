# Protocol

Shared Effect request/response schemas and typed authentication errors. Public
session responses contain only the wallet address, Sepolia chain ID, and expiry;
session tokens and persistence details never enter these DTOs.

- `/schema`: shared primitives such as `EthereumAddress`, SIWE messages and digests.
- `/dto`: public wallet-authentication requests and session responses.
- `/model`: validated challenge/session persistence models and insert schemas.
- `/errors`: expected authentication and database failures.

Root exports preserve the public schemas, but not persistence models. See
[package boundaries](../../architecture/engineering/repository.md).
