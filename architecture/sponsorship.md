# Sponsored Record Updates

The frontend uses ENSForge's pinned HCA deployment and Pimlico adapter on Sepolia.
The canonical salt-zero HCA is derived from the connected owner. Existing canonical
accounts are reused; arbitrary salts and other smart-account implementations are not
automatically discovered. Social proofs are still signed by the owner, not the HCA.

An owner-only setup banner deploys the HCA and grants resolver permissions using
wallet-paid transactions. The confirmation explains ENSForge's scope widening:
permissions may cover a name or resolver, not only the social records. Ownership
does not transfer. A deployed account must pass SDK verification and live record
permission checks before sponsored execution. Owners can switch to wallet gas.
Without setup, existing wallet-paid batching remains available.
The UIKit sponsorship switch is always available to the owner. When enabled, a
missing HCA shows "Set up HCA" and a deployed but unauthorized HCA shows "Authorize
HCA". Neither blocks normal wallet-paid writes before setup. "Check pending" appears
only while the wallet has a locally tracked operation, with updates synchronized
across tabs and components. Readiness requires a complete permission result, not an
empty list.

HCA readiness is shared across cards for 60 seconds and reused when choosing the
write path. It is not an authorization cache: the adapter and server still validate
the actual operation against current chain state. Returning from wallet prompts
does not trigger a page-wide query refresh; explicit refreshes and verification
intervals remain active. Sponsored receipt polling backs off from 4 to 12 seconds,
and the batched browser RPC transport permits only one retry per failed request.
ENSForge Effect atoms also have a 60-second stale window, a five-minute idle TTL,
and no focus refresh, interval refresh or retries. Direct SDK HCA calls are instead
deduplicated by the shared TanStack readiness query.

Setup reuses readiness, skips already authorized accounts, and passes the connected
Sepolia wallet client explicitly. Deployment waits for one confirmation before
permission grants; grants prefer wallet batching with sequential fallback. The
dialog reports preparation, deployment, authorization and final permission checks
separately instead of claiming a wallet prompt is already open. Completion requires
a fresh successful readiness check.

All six verification providers and their removal flows use `useRecordCalls`.
Sponsored writes are atomic owner-signed UserOperations. Failures do not silently
fall back to paid transactions. A wallet-scoped Web Lock prevents simultaneous
submissions across tabs. Immediately before submission, the operation hash, HCA,
and name are stored in localStorage (never signatures or credentials). A pending
operation blocks further writes, even wallet-paid writes, until its receipt and
EntryPoint event are checked against the chain. Unknown outcomes remain blocked;
clearing browser storage loses this local recovery guard. A dropped operation needs
manual investigation/replacement, not blind resubmission.

## Server Boundary

- `GET /sponsorship/configuration` returns only `{ enabled }`.
- `POST /sponsorship/:name/rpc` requires a wallet session and exact app Origin.
- Only Sepolia Pimlico methods needed by the adapter are accepted; no RPC batches.
- Before estimates, sponsorship or submission, verify active ENSv2 ownership,
  the canonical deployed HCA and current resolver permissions.
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
