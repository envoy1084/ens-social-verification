import { createSponsorshipValidationCache } from "@ens-social-verification/application";
import { afterEach, describe, expect, it, vi } from "vitest";

const identity = {
  snapshot: { hash: `0x${"11".repeat(32)}` as const, number: 1n, timestamp: 1n },
  owner: "0x1111111111111111111111111111111111111111" as const,
  sender: "0x2222222222222222222222222222222222222222",
  name: "alice.eth",
  nonce: "0x0",
  callData: "0x1234",
};

afterEach(() => vi.restoreAllMocks());

describe("sponsorship authorization cache", () => {
  it("reuses only the exact execution, owner, name and block", () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    const cache = createSponsorshipValidationCache();
    expect(cache.has(identity)).toBe(false);
    cache.remember(identity, 1000n);
    expect(cache.has(identity)).toBe(true);
    for (const changed of [
      { owner: identity.sender as typeof identity.owner },
      { sender: identity.owner },
      { name: "bob.eth" },
      { nonce: "0x1" },
      { callData: "0x1235" },
      { snapshot: { ...identity.snapshot, number: 2n } },
      { snapshot: { ...identity.snapshot, hash: `0x${"22".repeat(32)}` as const } },
    ])
      expect(cache.has({ ...identity, ...changed })).toBe(false);
    expect(createSponsorshipValidationCache().has(identity)).toBe(false);
  });

  it("expires at the TTL or name expiry, whichever comes first", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const cache = createSponsorshipValidationCache();
    cache.remember(identity, 1000n);
    clock.mockReturnValue(30_000);
    expect(cache.has(identity)).toBe(false);
    cache.remember(identity, 31n);
    clock.mockReturnValue(31_000);
    expect(cache.has(identity)).toBe(false);
  });

  it("bounds stored authorizations", () => {
    vi.spyOn(Date, "now").mockReturnValue(0);
    const cache = createSponsorshipValidationCache();
    cache.remember(identity, 1000n);
    for (let nonce = 1; nonce <= 64; nonce++)
      cache.remember({ ...identity, nonce: `0x${nonce.toString(16)}` }, 1000n);
    expect(cache.has(identity)).toBe(false);
    expect(cache.has({ ...identity, nonce: "0x40" })).toBe(true);
  });
});
