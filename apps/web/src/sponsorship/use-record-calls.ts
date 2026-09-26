import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { useEnsforge, useSendCalls } from "@ensforge/react";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { custom, isAddressEqual, verifyMessage, type Hex } from "viem";
import { getUserOperationHash } from "viem/account-abstraction";
import { sepolia } from "viem/chains";
import { useAccount, useSignMessage } from "wagmi";
import { getAccount, getWalletClient } from "wagmi/actions";

import { wagmiConfig } from "../wallet";
import { sponsorshipExecutionError } from "./execution-error";
import { deployedHcaAccount } from "./hca-account";
import {
  reconcileOperation,
  rememberOperation,
  sponsorshipRpc,
  SponsorshipRejected,
  forgetOperation,
} from "./pending-operation";
import { useHca } from "./use-hca";

export function useRecordCalls(name: string, recordKey: string) {
  const normal = useSendCalls();
  const sdk = useEnsforge();
  const account = useAccount();
  const sign = useSignMessage();
  const hca = useHca(name, recordKey);
  return {
    mutateAsync: async (input: Parameters<typeof normal.mutateAsync>[0]) => {
      const address = account.address;
      if (!address || account.chainId !== 11155111)
        throw new Error("Connect your wallet on Sepolia.");
      if (!navigator.locks)
        throw new Error("Use a browser supporting Web Locks for safe transaction submission.");
      return navigator.locks
        .request(
          `ens-record-update:${address.toLowerCase()}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) throw new Error("Another record update is in progress.");
            if (await reconcileOperation(address, sdk.config.publicClient))
              throw new Error(
                "Your previous update is confirmed. Refresh this profile before continuing.",
              );
            if (!hca.enabled || hca.prefersWalletGas()) return normal.mutateAsync(input);
            const hcaAddress = await hca.prepareForUpdate();
            const client = createPimlicoClient({
              chain: sepolia,
              entryPoint: {
                address: sepoliaHcaDeployment.infrastructure.entryPoint,
                version: "0.7",
              },
              transport: custom(
                {
                  request: async ({ method, params }) => {
                    if (method === "eth_sendUserOperation") {
                      const operation = (params as [{ nonce?: Hex }] | undefined)?.[0];
                      if (!operation?.nonce || !/^0x[0-9a-f]+$/i.test(operation.nonce))
                        throw new Error("Missing operation nonce");
                      rememberOperation(address, {
                        hash,
                        hca: hcaAddress,
                        name,
                        nonce: operation.nonce,
                      });
                    }
                    try {
                      return await sponsorshipRpc(name, method, (params ?? []) as unknown[]);
                    } catch (error) {
                      if (
                        method === "eth_sendUserOperation" &&
                        error instanceof SponsorshipRejected &&
                        error.notSubmitted
                      )
                        forgetOperation(address, hash);
                      throw error;
                    }
                  },
                },
                { retryCount: 0 },
              ),
            });
            const assertWallet = () => {
              const current = getAccount(wagmiConfig);
              if (current.address !== address || current.chainId !== 11155111)
                throw new Error("Wallet changed.");
            };
            const walletClient = await getWalletClient(wagmiConfig, { chainId: 11155111 });
            const calls = await sdk.batch.prepareCalls({
              calls: input.calls,
              account: address,
              walletClient,
            });
            const smartAccount = await deployedHcaAccount(sdk.config.publicClient, hcaAddress);
            const operation = await createSmartAccountClient({
              account: smartAccount,
              chain: sepolia,
              client: sdk.config.publicClient,
              bundlerTransport: custom(
                { request: (request) => client.request(request, { retryCount: 0 }) },
                { retryCount: 0 },
              ),
              paymaster: {
                getPaymasterData: client.getPaymasterData,
                getPaymasterStubData: client.getPaymasterStubData,
              },
              userOperation: {
                estimateFeesPerGas: async () => (await client.getUserOperationGasPrice()).fast,
              },
            }).prepareUserOperation({ calls });
            if (
              !operation.paymaster ||
              operation.factory ||
              operation.factoryData ||
              !isAddressEqual(operation.sender, hcaAddress) ||
              operation.callData !== (await smartAccount.encodeCalls(calls))
            )
              throw new Error("Prepared operation does not match the sponsored update.");
            const hash = getUserOperationHash({
              userOperation: operation,
              entryPointAddress: sepoliaHcaDeployment.infrastructure.entryPoint,
              entryPointVersion: "0.7",
              chainId: sepolia.id,
            });
            assertWallet();
            const signature = await sign.signMessageAsync({
              account: address,
              message: { raw: hash },
            });
            assertWallet();
            if (!(await verifyMessage({ address, message: { raw: hash }, signature })))
              throw new Error("The signature does not match the owner wallet.");
            // An accountless client submits the exact signed operation without preparing again.
            const submitted = await client.sendUserOperation({
              ...operation,
              signature,
              entryPointAddress: sepoliaHcaDeployment.infrastructure.entryPoint,
            });
            if (submitted !== hash) throw new Error("Bundler returned a different operation hash.");
            const result = await client.waitForUserOperationReceipt({
              hash,
              timeout: 120_000,
              pollingInterval: 4_000,
            });
            await reconcileOperation(
              address,
              sdk.config.publicClient,
              result.receipt.transactionHash,
            );
            return { mode: "sequential" as const, status: "completed" as const };
          },
        )
        .catch((error: unknown) => {
          throw sponsorshipExecutionError(error);
        });
    },
  };
}
