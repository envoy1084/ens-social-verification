import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { isAddressEqual, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";

import { env } from "../env";

export interface PendingOperation {
  hash: Hex;
  hca: Address;
  name: string;
  nonce?: Hex;
}
const key = (owner: Address) => `ens-sponsored-operation:11155111:${owner.toLowerCase()}`;
const changedEvent = "ens-sponsored-operation-changed";

export function hasPendingOperation(owner: Address | undefined) {
  return Boolean(owner && localStorage.getItem(key(owner)));
}

export function subscribePendingOperation(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changedEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changedEvent, notify);
  };
}

function clearOperation(owner: Address) {
  localStorage.removeItem(key(owner));
  window.dispatchEvent(new Event(changedEvent));
}

export class SponsorshipRejected extends Error {
  constructor(
    message: string,
    readonly notSubmitted: boolean,
  ) {
    super(message);
  }
}

export function forgetOperation(owner: Address, hash: Hex) {
  const saved = localStorage.getItem(key(owner));
  if (saved && (JSON.parse(saved) as PendingOperation).hash === hash) clearOperation(owner);
}

export function rememberOperation(owner: Address, pending: PendingOperation) {
  // Persist before HTTP submission. Storage failure must prevent sending.
  localStorage.setItem(key(owner), JSON.stringify(pending));
  window.dispatchEvent(new Event(changedEvent));
}

export async function sponsorshipRpc(name: string, method: string, params: readonly unknown[]) {
  const response = await fetch(`${env.serverUrl}/sponsorship/${encodeURIComponent(name)}/rpc`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(35_000),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new SponsorshipRejected(
      body.error?.message ?? "Sponsorship unavailable. Your operation may still be pending.",
      body.error?.notSubmitted === true,
    );
  return body.result;
}

export async function reconcileOperation(owner: Address, client: PublicClient) {
  const saved = localStorage.getItem(key(owner));
  if (!saved) return false;
  const pending = JSON.parse(saved) as PendingOperation;
  const result = await sponsorshipRpc(pending.name, "eth_getUserOperationReceipt", [pending.hash]);
  if (!result?.receipt?.transactionHash) {
    if (pending.nonce && /^0x[0-9a-f]+$/i.test(pending.nonce)) {
      const nonce = BigInt(pending.nonce);
      const current = await client.readContract({
        address: sepoliaHcaDeployment.infrastructure.entryPoint,
        abi: entryPoint07Abi,
        functionName: "getNonce",
        args: [pending.hca, nonce >> 64n],
        blockTag: "finalized",
      });
      if (current > nonce) {
        forgetOperation(owner, pending.hash);
        throw new Error(
          "The earlier operation's nonce was consumed. Refresh this profile before retrying.",
        );
      }
    }
    throw new Error(
      `An earlier sponsored update for ${pending.name} is still unresolved. Use Check pending above before another update.`,
    );
  }
  const receipt = await client.getTransactionReceipt({ hash: result.receipt.transactionHash });
  const entryPoint = sepoliaHcaDeployment.infrastructure.entryPoint;
  const event = parseEventLogs({
    abi: entryPoint07Abi,
    eventName: "UserOperationEvent",
    logs: receipt.logs.filter((log) => isAddressEqual(log.address, entryPoint)),
  }).find(
    (log) => log.args.userOpHash === pending.hash && isAddressEqual(log.args.sender, pending.hca),
  );
  if (!event) throw new Error("The sponsored transaction receipt could not be verified.");
  clearOperation(owner);
  if (!event.args.success || receipt.status !== "success")
    throw new Error("The sponsored update failed onchain. You can retry.");
  return true;
}
