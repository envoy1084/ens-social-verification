# Application

Effect business workflows. `Auth` issues browser-bound challenges, constructs SIWE
messages, verifies signatures, and creates/revokes wallet sessions. `SignatureVerifier`
supports EOAs and deployed ERC-1271 contracts on Sepolia through the injected client.

Live database, cryptography, configuration, and RPC Layers are composed in the server.
HTTP cookies and transport policy stay outside this package.

The read-only verification helpers use ENSForge with a V2-only Sepolia deployment,
block-pinned authority/record reads, and EIP-712 owner-signature validation.
`validateRecordAuthority` checks only ENS approval, not social provider evidence.
See [record verification](../../architecture/verification.md).

GitHub services coordinate OAuth/PKCE, short-lived encrypted tokens, signed public
gist publication and live proof verification. No operator attestation or backend ENS
transaction is created. The server composes provider, repository and crypto Layers.
