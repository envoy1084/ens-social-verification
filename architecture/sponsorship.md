# Sponsored Record Updates

The frontend uses ENSForge's pinned HCA deployment with a direct permissionless/Pimlico
UserOperation flow on Sepolia. ENSForge prepares resolver calls and handles setup;
the high-level HCA execution adapter is not used for record submission.
The canonical salt-zero HCA is derived from the connected owner. Existing canonical
accounts are reused; arbitrary salts and other smart-account implementations are not
automatically discovered. Social proofs are still signed by the owner, not the HCA.

The owner header contains only the UIKit sponsorship switch. It defaults to off.
`usehooks-ts` persists the browser-wide opt-in under `ens-sponsored-updates` in
localStorage and synchronizes hook instances and tabs. Updates resuming after
proof signing read the current preference, not the value when signing started.
With it off, updates
use normal wallet-paid batching without HCA lookups. With it on, each record update
checks HCA deployment and permissions on demand. Missing deployment or permissions
triggers a setup confirmation, wallet-paid setup, then the sponsored update. The
confirmation explains that permissions may cover the whole name or resolver; wallet
control and ENS ownership do not change. Cancelling or failed setup stops the write
instead of silently switching to wallet-paid execution. Readiness requires a complete
permission result, not an empty list.

HCA readiness queries are disabled for all background triggers, including mounting,
focus and invalidation. Only an explicit record update refreshes readiness. It
derives the canonical address and inspects deployment owner,
implementation, account ID and record permissions; it does not repeat the full
deployment-wiring verification. Lookup failures identify the failed stage.
It is not an authorization cache: the server still validates
the actual operation against current chain state. Returning from wallet prompts
does not trigger a page-wide query refresh; explicit and post-write refreshes remain
active. Social proof status no longer polls every five minutes while idle. Active
email inbox polling and attestation expiry timers remain. Sponsored receipt polling runs every four seconds,
and the batched browser RPC transport does not automatically retry failed requests.
Rate-limit errors return immediately rather than waiting for a retry window.
ENSForge Effect atoms also have a 60-second stale window, a five-minute idle TTL,
and no focus refresh, interval refresh or retries. Direct SDK HCA calls are instead
deduplicated by the shared TanStack readiness query.

Setup uses the update's fresh readiness, skips already authorized accounts, and passes the connected
Sepolia wallet client explicitly. Deployment waits for one confirmation before
permission grants. ENSForge checks the resolver and missing permissions. For a
permissioned resolver, the pinned ENSForge ABI encodes exact `grantSetterRoles`
calls locally rather than repeating resolver discovery for every grant. Public
resolver delegation uses the SDK preparer. Grants are combined into one resolver
multicall, simulated as the owner, then sent as one wallet transaction.
Already-authorized records are omitted, including after partially completed setup.
This avoids twelve separate permission transactions on wallets without batching.
Deployment remains a separate transaction when needed; record publication remains
a sponsored UserOperation after setup confirms. The
setup confirmation appears only when needed. Completion requires a fresh successful
readiness check before continuing to Pimlico. Wallet and network are checked between
setup stages. Setup and submission share the same wallet-scoped Web Lock.

The public RPC proxy permits a 240-request burst with the same 120/minute sustained
refill and ten concurrent requests. This accommodates ENSForge's repeated execution
checks without rejecting a single flow at the old 120-request burst boundary.
This does not reduce upstream usage or remove provider limits. Nested HTTP 429
errors are surfaced as rate limits instead of only a generic HCA revalidation error;
no automatic retries are added.

All six verification providers and their removal flows use `useRecordCalls`.
After readiness, the deployed-only account codec encodes the pinned HCA atomic
execution format and reads the EntryPoint nonce once. Pimlico prepares gas and
paymaster fields once. The owner signs the exact chain-bound operation hash;
signature recovery and sender/call-data checks are local. An accountless bundler
client submits that exact operation without preparing or estimating it again.
There are no adapter verification passes, repeated network/wiring probes, or
pre/post-signature gas re-estimates. Backend policy validation remains mandatory.
Sponsored writes are atomic owner-signed UserOperations. Failures do not silently
fall back to paid transactions. A wallet-scoped Web Lock prevents simultaneous
submissions across tabs. Immediately before submission, the operation hash, HCA,
name and nonce are stored in localStorage (never signatures or credentials). A pending
operation blocks further writes, even wallet-paid writes, until its receipt and
EntryPoint event are checked against the chain. Unknown outcomes remain blocked;
clearing browser storage loses this local recovery guard. A dropped operation needs
manual investigation/replacement, not blind resubmission.

Correlated ERC-7769 validation rejections clear the matching pending hash immediately.
Unknown errors, malformed replies and transport timeouts do not. If the bundler has
no receipt, a finalized EntryPoint nonce greater than the saved nonce also releases
the lock because the operation can no longer execute; the user must refresh before
retrying. Older journals without a nonce remain guarded until a receipt is found.
This lock is wallet-wide, so an unresolved update blocks other providers too.

## Server Boundary

- `GET /sponsorship/configuration` returns only `{ enabled }`.
- `POST /sponsorship/:name/rpc` requires a wallet session and exact app Origin.
- Only Sepolia Pimlico methods needed by the submission flow are accepted; no RPC batches.
- Before estimates, sponsorship or submission, verify active ENSv2 ownership,
  the canonical deployed HCA and current resolver permissions.
- Canonical address derivation is checked by `verifyHca` with the expected owner
  and salt zero, without a redundant `predictHcaAddress` deployment-wiring check.
  HCA, resolver and permission reads use the authority snapshot's block number;
  canonicality is checked again at the end. Ownership and record permission results
  are never cached. Successful HCA deployment verification is reused only for an
  identical block hash, block number, HCA, owner and SDK client (salt zero). In-flight
  checks are shared; failures are evicted. Each client retains at most 64 entries for
  30 seconds. New blocks and reorgs miss the cache; the final canonicality check stays
  mandatory even on a cache hit.
- Decode HCA execution: one zero-value resolver multicall containing exactly one
  supported social text key and its verification companion for the same name.
  Both permissioned DNS-name and public-resolver node encodings are supported.
- Reject factory/deployment, EIP-7702, arbitrary calls, excessive gas/fees and unknown
  UserOperation fields. Paymaster context is replaced with the server's policy ID.
- Requests are bounded to 16 KiB, five concurrent and 120/minute per process.
  These are availability limits, not a durable spending budget.

Set `PIMLICO_RPC_URL` to the authenticated Sepolia endpoint and
`PIMLICO_SPONSORSHIP_POLICY_ID` in the server environment only. Configure wallet,
operation and total spending limits in the Pimlico policy; those remain effective
across server restarts/replicas. No new tables or server wallet key are required.
Pimlico must accept the pinned HCA implementation and EntryPoint 0.7; network and
EntryPoint checks alone do not prove full bundler compatibility. Deployment,
permission grants and end-to-end sponsorship require a real wallet test.

After Pimlico reports inclusion, the frontend checks the chain receipt, matching
EntryPoint event and canonical block hash before clearing the pending operation.
The same receipt validation handles interrupted or ambiguous submissions. Receipt
polling does not repeat network or deployment verification.
