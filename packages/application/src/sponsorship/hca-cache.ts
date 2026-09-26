import type { Ensforge } from "@ensforge/sdk";
import type { Address } from "viem";

import type { VerificationSnapshot } from "../verification/snapshot.js";

type Verify = (
  parameters: Parameters<Ensforge["hca"]["verifyHca"]>[0],
) => ReturnType<Ensforge["hca"]["verifyHca"]>;
const caches = new WeakMap<Verify, Map<string, { expires: number; result: ReturnType<Verify> }>>();

export function verifyHcaAtSnapshot(
  verify: Verify,
  snapshot: VerificationSnapshot,
  hca: Address,
  owner: Address,
) {
  let cache = caches.get(verify);
  if (!cache) {
    cache = new Map();
    caches.set(verify, cache);
  }
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  const key = `${snapshot.hash}:${snapshot.number}:${hca.toLowerCase()}:${owner.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached.result;
  const oldest = cache.keys().next().value;
  if (cache.size >= 64 && oldest !== undefined) cache.delete(oldest);
  const result = verify({ hca, expectedOwner: owner, salt: 0n, blockNumber: snapshot.number });
  cache.set(key, { expires: now + 30_000, result });
  const entries = cache;
  void result.catch(() => {
    if (entries.get(key)?.result === result) entries.delete(key);
  });
  return result;
}
