# Application

Effect business workflows. `Auth` issues browser-bound challenges, constructs SIWE
messages, verifies signatures, and creates/revokes wallet sessions. `SignatureVerifier`
supports EOAs and deployed ERC-1271 contracts on Sepolia through the injected client.

Live database, cryptography, configuration, and RPC Layers are composed in the server.
HTTP cookies and transport policy stay outside this package.
