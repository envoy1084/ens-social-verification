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

Root exports also include record-verification descriptor, claim, hashing and typed-data
helpers. Only the experimental Sepolia ENSv2 authority profile is supported.
See [verification boundaries](../../architecture/verification.md).

GitHub schemas and helpers define the experimental `github.gist.v1` envelope,
canonical JSON encoding and strict gist URL parsing. No operator signature is used.
