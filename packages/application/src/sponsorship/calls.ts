import { sponsoredRecordKeys } from "@ens-social-verification/protocol/schema";
import { standaloneHcaV2UserOperationAbi } from "@ensforge/contracts/v2";
import {
  decodeAbiParameters,
  decodeFunctionData,
  isAddressEqual,
  namehash,
  padHex,
  parseAbi,
  type Address,
  type Hex,
  bytesToHex,
} from "viem";
import { packetToBytes } from "viem/ens";

const resolverAbi = parseAbi([
  "function multicall(bytes[] data) returns (bytes[])",
  "function setText(bytes32 node, string key, string value)",
  "function setText(bytes name, string key, string value)",
]);
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

/** Only an atomic social value/companion pair, never approvals, transfers or arbitrary calls. */
export function validateSponsoredCalls(data: Hex, name: string, resolver: Address) {
  const outer = decodeFunctionData({ abi: standaloneHcaV2UserOperationAbi, data });
  if (
    outer.functionName !== "execute" ||
    outer.args[0] !== padHex("0x01", { size: 32, dir: "right" })
  )
    throw new Error("Only atomic HCA batches are sponsored");
  const [calls] = decodeAbiParameters(batch, outer.args[1]);
  const call = calls[0];
  if (calls.length !== 1 || !call) throw new Error("Expected one resolver batch");
  if (!isAddressEqual(call.target, resolver) || call.value !== 0n)
    throw new Error("Unsupported sponsorship target");
  const decoded = decodeFunctionData({ abi: resolverAbi, data: call.callData });
  if (decoded.functionName !== "multicall" || decoded.args[0].length !== 2)
    throw new Error("Expected two text records");
  const keys = decoded.args[0].map((inner) => {
    const record = decodeFunctionData({ abi: resolverAbi, data: inner });
    if (
      record.functionName !== "setText" ||
      (record.args[0] !== namehash(name) && record.args[0] !== bytesToHex(packetToBytes(name))) ||
      record.args[2].length > 4096
    )
      throw new Error("Unsupported sponsored record");
    return record.args[1];
  });
  const primaryKey = sponsoredRecordKeys.find((candidate) => keys.includes(candidate));
  if (!primaryKey || !keys.includes(`verification[text][${primaryKey}]`))
    throw new Error("Mismatched record pair");
  return keys.map((key) => ({ type: "text" as const, key }));
}
