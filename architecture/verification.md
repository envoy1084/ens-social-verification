# Record Verification Helpers

This is an experimental ENSv2-only Sepolia profile: descriptor authority `a=2`,
EIP-712 domain `ENS Record Verification`, version `1`, chain ID `11155111`.
Neither the authority number nor future social method identifiers are upstream
allocations. This is not mainnet conformance.

## Boundaries

Protocol owns descriptor grammar, text companion keys, exact UTF-8 value hashing,
closed claim/envelope schemas, claim construction, and typed data. JSON timestamps
and authority version are canonical decimal strings; typed data converts them to
EVM integers. Parsing a method identifier does not establish method support:
`validateDescriptorMethod` requires the caller's exact method and URI policy.
Only HTTPS proof locations are accepted. Parsing does not fetch or make a URI safe
to fetch; method-specific retrieval must add SSRF, size and timeout limits.

Application owns the read-only ENSForge client, evaluation snapshots, authority
resolution, record reads, and EOA/ERC-1271 signature checks. Server exports
`RecordVerificationLive` for server composition. GitHub-specific routes, persistence
and retrieval are documented in [signed GitHub gists](github.md).
Wallet signatures and record-update transactions remain frontend responsibilities.

`validateRecordAuthority` accepts an already decoded envelope object and a trusted
method implementation's target-derivation function. It validates the ENS side only;
its result is not a verified social connection. Method evidence remains unknown.
Raw-envelope decoders must bound bytes and reject duplicate JSON members before
verification. The GitHub method enforces an exact canonical JSON encoding for this.

## Authority Algorithm 2

Only exact second-level `.eth` names are supported. The client omits V1 deployment
configuration, disables indexers, and forbids offchain gateways. The deployment is
ENSForge contracts 0.6.0's October 1, 2026 Sepolia manifest, contracts-v2 revision
`07e55a056f5b6a9c90119f501bdd05714e67dddd`. Both the frontend and authority client
use this manifest; registrations and resolver permissions on the previous deployment
are not carried over automatically.

Normalize the name, authenticate root -> .eth against the configured registry,
read the exact label's state, require REGISTERED and unexpired ownership, then read
`ownerOf` using the state's current token ID. Require the same nonzero owner.
Reserved V1 migration entries, expired/grace names, unsupported routes, subnames,
and virtual names do not have authority under this profile. Migrated names that
are active exact registrations in this V2 registry use the same owner rule.
Delegates, resolved addresses and resolver owners are never substituted.

Every read and ERC-1271 call uses the same block number. The hash/timestamp are
checked again to detect a reorg, with a five-minute maximum block age and 30-second
future tolerance. The initial snapshot uses latest, not finalized: results are
observations and must be rechecked, not permanent finality guarantees. ENSForge
currently exposes block numbers rather than EIP-1898 block hashes. The provider is
trusted to serve coherent canonical reads; hash rechecks are not a light client.

Authority expiry is registration expiry, never grace-period end. Live time must
remain below authority and claim expiry; issuedAt permits at most 300 seconds of
future skew. A final method verifier must repeat freshness/expiry checks after
network evidence retrieval. Ordinary deployed contracts require ERC-1271 approval;
rejection never falls back to EOA recovery. EIP-7702 accounts with the exact 23-byte
delegation indicator accept recovery to the authority address first, then ERC-1271
at that same address for custom signatures. The implementation address is not an
ENS authority. Both paths retain snapshot checks and reject RPC failures.
Undeployed smart accounts (ERC-6492) remain unsupported.

Transfers invalidate old-owner claims. Routine token regeneration does not invalidate
an otherwise matching claim. Returning to a previous owner can reactivate an
unexpired proof. No permanent revocation or universal ownership epoch is implied.
Contract upgrades or deployment changes require review of this fixed profile;
there is no automatic semantic migration or runtime upgrade monitoring.

## Checks

Server unit tests exercise descriptor grammar, claim binding, expiry, signatures,
registry routing, reserved entries, token ownership, RPC failure and block changes.
No test calls a provider or sends a transaction. Live smoke checks are read-only.
