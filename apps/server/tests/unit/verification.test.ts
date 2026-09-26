import { Effect } from "effect";

import {
  createVerificationClient,
  VerificationClient,
  verificationDeployment,
  resolveEnsV2Authority,
  verifyAuthoritySignature,
  createVerificationSnapshot,
} from "@ens-social-verification/application";
import {
  createVerificationClaim,
  formatVerificationDescriptor,
  getVerificationRecordKey,
  getVerificationTypedData,
  hashTextRecordValue,
  hashVerificationClaim,
  parseVerificationDescriptor,
  validateVerificationClaim,
  validateClaimLifetime,
  validateDescriptorMethod,
} from "@ens-social-verification/protocol";
import {
  createPublicClient,
  custom,
  encodeFunctionResult,
  parseAbi,
  toFunctionSelector,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { describe, expect, it } from "vitest";

const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const timestamp = BigInt(Math.floor(Date.now() / 1000));
const blockHash = `0x${"11".repeat(32)}` as const;
const snapshot = { number: 100n, hash: blockHash, timestamp };
const draft = {
  name: "alice.eth",
  recordKey: "com.example",
  value: "alice",
  authority: owner.address,
  method: "example-control.v1",
  target: "https://example.com/alice",
  issuedAt: timestamp.toString(),
  validUntil: (timestamp + 3600n).toString(),
};

function fixture() {
  const state = {
    status: 2,
    expiry: timestamp + 86400n,
    latestOwner: owner.address,
    tokenId: 42n,
    resource: 1n,
  };
  const rpc = {
    state,
    route: verificationDeployment.contracts.ethRegistry as `0x${string}`,
    owner: owner.address,
    code: "0x",
    magic: "0x1626ba7e",
    hash: blockHash,
    unavailable: false,
    signatureUnavailable: false,
    chainId: 11155111,
  };
  const abi = parseAbi([
    "function getSubregistry(string label) view returns (address)",
    "function getState(uint256 id) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  ]);
  const calls: string[] = [];
  const client = createPublicClient({
    chain: sepolia,
    transport: custom(
      {
        request: async ({ method, params }) => {
          if (rpc.unavailable) throw new Error("RPC unavailable");
          if (method === "eth_chainId") return `0x${rpc.chainId.toString(16)}`;
          if (method === "eth_getBlockByNumber")
            return { number: "0x64", hash: rpc.hash, timestamp: `0x${timestamp.toString(16)}` };
          if (method === "eth_getCode") return rpc.code;
          if (method === "eth_call") {
            const [call, block] = params as [{ data: string; to: string }, string];
            calls.push(block);
            const selector = call.data.slice(0, 10);
            if (selector === toFunctionSelector("getSubregistry(string)"))
              return encodeFunctionResult({
                abi,
                functionName: "getSubregistry",
                result: rpc.route,
              });
            if (selector === toFunctionSelector("getState(uint256)"))
              return encodeFunctionResult({ abi, functionName: "getState", result: rpc.state });
            if (selector === toFunctionSelector("ownerOf(uint256)"))
              return encodeFunctionResult({ abi, functionName: "ownerOf", result: rpc.owner });
            if (selector === toFunctionSelector("isValidSignature(bytes32,bytes)")) {
              expect(call.to.toLowerCase()).toBe(owner.address.toLowerCase());
              if (rpc.signatureUnavailable) throw new Error("RPC unavailable");
              return encodeFunctionResult({
                abi,
                functionName: "isValidSignature",
                result: rpc.magic as `0x${string}`,
              });
            }
          }
          throw new Error(`Unexpected RPC method: ${method}`);
        },
      },
      { retryCount: 0 },
    ),
  });
  const sdk = createVerificationClient(client);
  return { rpc, calls, sdk };
}

describe("record verification protocol", () => {
  it("parses reordered fields and formats canonical descriptors", async () => {
    const parsed = await Effect.runPromise(
      parseVerificationDescriptor(
        "ensrv1 u=https://example.com/proof?x=a=b m=example-control.v1 a=2",
      ),
    );
    expect(await Effect.runPromise(formatVerificationDescriptor(parsed))).toBe(
      "ensrv1 a=2 m=example-control.v1 u=https://example.com/proof?x=a=b",
    );
    expect(await Effect.runPromise(getVerificationRecordKey("com.example"))).toBe(
      "verification[text][com.example]",
    );
  });
  it.each([
    "ensrv1 a=1 m=example.v1",
    "ensrv1 a=02 m=example.v1",
    "ensrv1  a=2 m=example.v1",
    "ensrv1 a=2 m=example.v1 ",
    "ensrv1 a=2 m=example.v1 a=2",
    "ensrv1 a=2 m=example.v1 h=abc",
    "ensrv1 a=2 m=Example.v1",
    "ensrv1 a=2 m=example.v01",
    "ensrv1 a=2 m=example.v1 u=http://example.com",
    "ensrv1 a=2 m=example.v1 u=https://user:pass@example.com",
    "ensrv1 a=2 m=example.v1 u=https://example.com/#",
    "ensrv1 a=2 m=example.v1 u=https://example.com/%zz",
    "ensrv1 a=2 m=example.v1 u=https://éxample.com",
  ])("rejects unsafe descriptor %s", async (value) => {
    await expect(Effect.runPromise(parseVerificationDescriptor(value))).rejects.toThrow();
  });
  it("separates parsing from method support", async () => {
    const descriptor = await Effect.runPromise(
      parseVerificationDescriptor("ensrv1 a=2 m=example.v1"),
    );
    await expect(
      Effect.runPromise(validateDescriptorMethod(descriptor, "other.v1", "forbidden")),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(validateDescriptorMethod(descriptor, "example.v1", "required")),
    ).rejects.toThrow();
  });
  it("binds exact record bytes and rejects malformed or inconsistent claims", async () => {
    const claim = await Effect.runPromise(createVerificationClaim({ ...draft, name: "ALICE.eth" }));
    expect(claim.name).toBe("alice.eth");
    expect(hashTextRecordValue("Alice")).not.toBe(hashTextRecordValue("alice"));
    expect(hashTextRecordValue("alice ")).not.toBe(hashTextRecordValue("alice"));
    expect(hashVerificationClaim(claim)).not.toBe(
      hashVerificationClaim({ ...claim, target: "https://example.com/bob" }),
    );
    for (const change of [
      { node: blockHash },
      { authorityVersion: "1" },
      { validUntil: claim.issuedAt },
      { issuedAt: "01" },
      { issuedAt: "18446744073709551616" },
      { nonce: "extra" },
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Validate each independently malformed claim.
      await expect(
        Effect.runPromise(validateVerificationClaim({ ...claim, ...change })),
      ).rejects.toThrow();
    }
    await expect(
      Effect.runPromise(createVerificationClaim({ ...draft, name: "sub.alice.eth" })),
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(validateClaimLifetime(claim, timestamp + 3600n, timestamp + 86400n)),
    ).rejects.toThrow();
  });
});

describe("experimental ENSv2 authority 2", () => {
  it("uses a V2-only deployment and pins current token ownership reads", async () => {
    const { sdk, calls } = fixture();
    expect(sdk.config.deployments.v1).toBeUndefined();
    const result = await Effect.runPromise(
      resolveEnsV2Authority("alice.eth", snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
      ),
    );
    expect(result.authority).toBe(owner.address);
    expect(result.tokenId).toBe(42n);
    expect(calls).toEqual(["0x64", "0x64", "0x64"]);
  });
  it.each(["reserved", "expired", "route", "owner", "reorg"] as const)(
    "rejects %s state",
    async (failure) => {
      const { sdk, rpc } = fixture();
      if (failure === "reserved") rpc.state.status = 1;
      if (failure === "expired") rpc.state.expiry = timestamp;
      if (failure === "route") rpc.route = stranger.address;
      if (failure === "owner") rpc.owner = stranger.address;
      if (failure === "reorg") rpc.hash = `0x${"22".repeat(32)}`;
      await expect(
        Effect.runPromise(
          resolveEnsV2Authority("alice.eth", snapshot).pipe(
            Effect.provideService(VerificationClient, sdk),
          ),
        ),
      ).rejects.toThrow();
    },
  );
  it("rejects mainnet RPC and reports unavailable RPC separately", async () => {
    const { sdk, rpc } = fixture();
    rpc.chainId = 1;
    await expect(
      Effect.runPromise(
        createVerificationSnapshot().pipe(Effect.provideService(VerificationClient, sdk)),
      ),
    ).rejects.toThrow("Sepolia");
    rpc.unavailable = true;
    const result = await Effect.runPromise(
      resolveEnsV2Authority("alice.eth", snapshot).pipe(
        Effect.provideService(VerificationClient, sdk),
        Effect.flip,
      ),
    );
    expect(result.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
  it("checks owner signatures and deployed contract signatures", async () => {
    const { sdk, rpc } = fixture();
    const claim = await Effect.runPromise(createVerificationClaim(draft));
    const signature = await owner.signTypedData(getVerificationTypedData(claim));
    const run = () =>
      Effect.runPromise(
        verifyAuthoritySignature(claim, signature, owner.address, snapshot).pipe(
          Effect.provideService(VerificationClient, sdk),
        ),
      );
    await expect(run()).resolves.toBeUndefined();
    const wrong = await stranger.signTypedData(getVerificationTypedData(claim));
    await expect(
      Effect.runPromise(
        verifyAuthoritySignature(claim, wrong, owner.address, snapshot).pipe(
          Effect.provideService(VerificationClient, sdk),
        ),
      ),
    ).rejects.toThrow();
    rpc.code = "0x6000";
    await expect(run()).resolves.toBeUndefined();
    rpc.magic = "0xffffffff";
    await expect(run()).rejects.toThrow();
  });
  it("accepts delegated own-key and ERC-1271 signatures without trusting the delegate key", async () => {
    const { sdk, rpc, calls } = fixture();
    const claim = await Effect.runPromise(createVerificationClaim(draft));
    const signature = await owner.signTypedData(getVerificationTypedData(claim));
    const wrong = await stranger.signTypedData(getVerificationTypedData(claim));
    const run = (proofSignature: string) =>
      Effect.runPromise(
        verifyAuthoritySignature(claim, proofSignature, owner.address, snapshot).pipe(
          Effect.provideService(VerificationClient, sdk),
        ),
      );
    rpc.code = `0xef0100${stranger.address.slice(2)}`;
    rpc.magic = "0xffffffff";
    await expect(run(signature)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
    await expect(run(wrong)).rejects.toThrow("rejected signature");
    await expect(run("0x1234")).rejects.toThrow("rejected signature");
    rpc.magic = "0x1626ba7e";
    await expect(run("0x1234")).resolves.toBeUndefined();
    expect(calls.every((block) => block === "0x64")).toBe(true);
    rpc.signatureUnavailable = true;
    await expect(run(wrong)).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
    rpc.signatureUnavailable = false;
    rpc.hash = `0x${"22".repeat(32)}`;
    await expect(run(signature)).rejects.toThrow();
    rpc.hash = blockHash;
    rpc.code += "00";
    rpc.magic = "0xffffffff";
    await expect(run(signature)).rejects.toThrow("rejected signature");
  });
});
