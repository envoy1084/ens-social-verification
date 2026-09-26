import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { standaloneHcaV2UserOperationAbi } from "@ensforge/contracts/v2";
import {
  encodeAbiParameters,
  encodeFunctionData,
  padHex,
  type Address,
  type PublicClient,
} from "viem";
import { entryPoint07Abi, toSmartAccount } from "viem/account-abstraction";

const unsupported = async (): Promise<never> => {
  throw new Error("Sign the prepared UserOperation with the owner wallet.");
};

export async function deployedHcaAccount(client: PublicClient, address: Address) {
  return toSmartAccount({
    client,
    entryPoint: {
      address: sepoliaHcaDeployment.infrastructure.entryPoint,
      abi: entryPoint07Abi,
      version: "0.7",
    },
    getAddress: async () => address,
    getFactoryArgs: async () => ({ factory: undefined, factoryData: undefined }),
    getNonce: async () =>
      client.readContract({
        address: sepoliaHcaDeployment.infrastructure.entryPoint,
        abi: entryPoint07Abi,
        functionName: "getNonce",
        args: [address, 0n],
      }),
    encodeCalls: async (calls) =>
      encodeFunctionData({
        abi: standaloneHcaV2UserOperationAbi,
        functionName: "execute",
        args: [
          padHex("0x01", { size: 32, dir: "right" }),
          encodeAbiParameters(
            [
              {
                type: "tuple[]",
                components: [
                  { name: "target", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "callData", type: "bytes" },
                ],
              },
            ],
            [
              calls.map((call) => ({
                target: call.to,
                value: call.value ?? 0n,
                callData: call.data ?? "0x",
              })),
            ],
          ),
        ],
      }),
    getStubSignature: async () => `0x${"11".repeat(32)}${"22".repeat(32)}1b`,
    signMessage: unsupported,
    signTypedData: unsupported,
    signUserOperation: unsupported,
  });
}
