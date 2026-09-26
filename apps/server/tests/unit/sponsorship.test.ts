import { Effect, Exit } from "effect";

import {
  validateSponsoredCalls,
  validateSponsorshipRequest,
  createVerificationClient,
  VerificationClient,
} from "@ens-social-verification/application";
import {
  bytesToHex,
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeFunctionData,
  namehash,
  padHex,
  parseAbi,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";
import { describe, expect, it, vi } from "vitest";

const resolver = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";
const name = "alice.eth";
const publicAbi = parseAbi(["function setText(bytes32 node,string key,string value)"]);
const permissionedAbi = parseAbi(["function setText(bytes name,string key,string value)"]);
const multicallAbi = parseAbi(["function multicall(bytes[] data)"]);
const executeAbi = parseAbi(["function execute(bytes32 mode,bytes executionCalldata)"]);
const batch = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "callData", type: "bytes" },
    ],
  },
] as const;

function encodeRecords(
  keys = ["com.github", "verification[text][com.github]"],
  recordName = name,
  permissioned = false,
) {
  return keys.map((key) =>
    encodeFunctionData({
      abi: permissioned ? permissionedAbi : publicAbi,
      functionName: "setText",
      args: [permissioned ? bytesToHex(packetToBytes(recordName)) : namehash(recordName), key, ""],
    }),
  );
}
function encodeBatch(
  records = encodeRecords(),
  target = resolver,
  value = 0n,
  mode = padHex("0x01", { size: 32, dir: "right" }),
) {
  return encodeFunctionData({
    abi: executeAbi,
    functionName: "execute",
    args: [
      mode,
      encodeAbiParameters(batch, [
        [
          {
            target: target as Hex,
            value,
            callData: encodeFunctionData({
              abi: multicallAbi,
              functionName: "multicall",
              args: [records],
            }),
          },
        ],
      ]),
    ],
  });
}

describe("sponsored record policy", () => {
  it("accepts public and permissioned resolver pairs, including removals", () => {
    for (const permissioned of [false, true]) {
      expect(
        validateSponsoredCalls(
          encodeBatch(encodeRecords(undefined, name, permissioned)),
          name,
          resolver,
        ),
      ).toEqual([
        { type: "text", key: "com.github" },
        { type: "text", key: "verification[text][com.github]" },
      ]);
    }
  });
  it("rejects another resolver, ETH transfers, non-atomic mode and another name", () => {
    for (const call of [
      encodeBatch(undefined, owner),
      encodeBatch(undefined, resolver, 1n),
      encodeBatch(undefined, resolver, 0n, padHex("0x00", { size: 32 })),
      encodeBatch(encodeRecords(undefined, "bob.eth")),
      encodeBatch(encodeRecords(undefined, "bob.eth", true)),
    ])
      expect(() => validateSponsoredCalls(call, name, resolver)).toThrow();
  });
  it("rejects unrelated, mismatched, duplicate and extra records and nested batches", () => {
    for (const keys of [
      ["url", "verification[text][url]"],
      ["com.github", "verification[text][com.twitter]"],
      ["com.github", "com.github"],
      ["com.github"],
      ["com.github", "verification[text][com.github]", "email"],
    ])
      expect(() =>
        validateSponsoredCalls(encodeBatch(encodeRecords(keys)), name, resolver),
      ).toThrow();
    expect(() =>
      validateSponsoredCalls(
        encodeBatch([
          encodeFunctionData({
            abi: multicallAbi,
            functionName: "multicall",
            args: [encodeRecords()],
          }),
        ]),
        name,
        resolver,
      ),
    ).toThrow();
  });
  it("rejects wrong chain/EntryPoint and unsupported deployment fields before chain access", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("Unexpected chain read");
    });
    const sdk = createVerificationClient(
      createPublicClient({
        chain: sepolia,
        transport: custom({ request: rpc }, { retryCount: 0 }),
      }),
    );
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "pm_getPaymasterData" as const,
      params: [{}, resolver, "0x1", {}],
    };
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(
          validateSponsorshipRequest(request, name, owner).pipe(
            Effect.provideService(VerificationClient, sdk),
          ),
        ),
      ),
    ).toBe(true);
    const entryPoint = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
    await Promise.all(
      [{ factory: owner }, { eip7702Auth: {} }, { callGasLimit: "0x989680" }].map(async (extra) => {
        const op = { sender: owner, nonce: "0x0", callData: "0x", ...extra };
        expect(
          Exit.isFailure(
            await Effect.runPromiseExit(
              validateSponsorshipRequest(
                { ...request, params: [op, entryPoint, "0xaa36a7", {}] },
                name,
                owner,
              ).pipe(Effect.provideService(VerificationClient, sdk)),
            ),
          ),
        ).toBe(true);
      }),
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
