import { verifyHcaAtSnapshot } from "@ens-social-verification/application";
import { afterEach, describe, expect, it, vi } from "vitest";

const owner = "0x1111111111111111111111111111111111111111";
const hca = "0x2222222222222222222222222222222222222222";
const snapshot = { hash: `0x${"11".repeat(32)}` as const, number: 1n, timestamp: 1n };
const account = {
  kind: "ens-hca" as const,
  address: hca,
  owner,
  chainId: 11155111,
  profileId: "test",
  initialImplementation: hca,
  currentImplementation: hca,
  salt: 0n,
  sessionNonce: 0n,
  verifiedAtBlock: 1n,
} as const;

afterEach(() => vi.restoreAllMocks());

describe("block-scoped HCA verification", () => {
  it("shares concurrent verification only for the same owner, HCA and exact block", async () => {
    const verify = vi.fn(async () => account);
    await Promise.all([
      verifyHcaAtSnapshot(verify, snapshot, hca, owner),
      verifyHcaAtSnapshot(verify, snapshot, hca, owner),
    ]);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith({ hca, expectedOwner: owner, salt: 0n, blockNumber: 1n });
    await verifyHcaAtSnapshot(verify, { ...snapshot, hash: `0x${"22".repeat(32)}` }, hca, owner);
    await verifyHcaAtSnapshot(verify, snapshot, owner, owner);
    await verifyHcaAtSnapshot(verify, snapshot, hca, hca);
    expect(verify).toHaveBeenCalledTimes(4);
  });

  it("does not cache failures or share results between clients", async () => {
    const verify = vi.fn(async () => account).mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(verifyHcaAtSnapshot(verify, snapshot, hca, owner)).rejects.toThrow(
      "RPC unavailable",
    );
    await verifyHcaAtSnapshot(verify, snapshot, hca, owner);
    expect(verify).toHaveBeenCalledTimes(2);
    const other = vi.fn(async () => account);
    await verifyHcaAtSnapshot(other, snapshot, hca, owner);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("expires results and bounds retained entries", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const verify = vi.fn(async () => account);
    await verifyHcaAtSnapshot(verify, snapshot, hca, owner);
    clock.mockReturnValue(30_000);
    await verifyHcaAtSnapshot(verify, snapshot, hca, owner);
    expect(verify).toHaveBeenCalledTimes(2);
    await Promise.all(
      Array.from({ length: 64 }, (_, i) =>
        verifyHcaAtSnapshot(verify, { ...snapshot, number: BigInt(i + 2) }, hca, owner),
      ),
    );
    await verifyHcaAtSnapshot(verify, snapshot, hca, owner);
    expect(verify).toHaveBeenCalledTimes(67);
  });
});
