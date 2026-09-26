import {
  createVerificationClient,
  verificationDeployment,
} from "@ens-social-verification/application";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";

export function ensRecordFixture(owner: Address) {
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const rpc = { owner };
  const records: Record<string, string> = {};
  const abi = parseAbi([
    "function getSubregistry(string label) view returns (address)",
    "function getState(uint256 id) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function resolve(bytes name, bytes data) view returns (bytes result, address resolver)",
    "function multicall(bytes[] data) view returns (bytes[] results)",
    "function text(bytes32 node, string key) view returns (string)",
  ]);
  const client = createPublicClient({
    chain: sepolia,
    transport: custom(
      {
        request: async ({ method, params }) => {
          if (method === "eth_chainId") return "0xaa36a7";
          if (method === "eth_getBlockByNumber")
            return {
              number: "0x64",
              hash: `0x${"11".repeat(32)}`,
              timestamp: `0x${timestamp.toString(16)}`,
            };
          if (method === "eth_getCode") return "0x";
          if (method === "eth_call") {
            const [call] = params as [{ data: Hex }];
            const selector = call.data.slice(0, 10);
            if (selector === toFunctionSelector("getSubregistry(string)"))
              return encodeFunctionResult({
                abi,
                functionName: "getSubregistry",
                result: verificationDeployment.contracts.ethRegistry,
              });
            if (selector === toFunctionSelector("getState(uint256)"))
              return encodeFunctionResult({
                abi,
                functionName: "getState",
                result: {
                  status: 2,
                  expiry: timestamp + 864000n,
                  latestOwner: rpc.owner,
                  tokenId: 1n,
                  resource: 1n,
                },
              });
            if (selector === toFunctionSelector("ownerOf(uint256)"))
              return encodeFunctionResult({ abi, functionName: "ownerOf", result: rpc.owner });
            if (selector === toFunctionSelector("resolve(bytes,bytes)")) {
              const resolved = decodeFunctionData({ abi, data: call.data });
              if (resolved.functionName !== "resolve") throw new Error("Expected resolve");
              const batch = decodeFunctionData({ abi, data: resolved.args[1] });
              if (batch.functionName !== "multicall") throw new Error("Expected multicall");
              const results = batch.args[0].map((data) => {
                const text = decodeFunctionData({ abi, data });
                if (text.functionName !== "text") throw new Error("Expected text");
                return encodeFunctionResult({
                  abi,
                  functionName: "text",
                  result: records[text.args[1]] ?? "",
                });
              });
              return encodeFunctionResult({
                abi,
                functionName: "resolve",
                result: [
                  encodeFunctionResult({ abi, functionName: "multicall", result: results }),
                  owner,
                ],
              });
            }
          }
          throw new Error(`Unexpected RPC: ${method}`);
        },
      },
      { retryCount: 0 },
    ),
  });
  const sdk = createVerificationClient(client);
  return { sdk, rpc, records };
}
