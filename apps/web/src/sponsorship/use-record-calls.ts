import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { pimlico } from "@ensforge/hca/pimlico";
import { useEnsforge, useSendCalls } from "@ensforge/react";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { custom, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { useAccount, useSignMessage } from "wagmi";
import { getAccount } from "wagmi/actions";

import { wagmiConfig } from "../wallet";
import {
  reconcileOperation,
  rememberOperation,
  sponsorshipRpc,
  SponsorshipRejected,
  forgetOperation,
} from "./pending-operation";
import { useHca } from "./use-hca";

export function useRecordCalls(name: string) {
  const normal = useSendCalls();
  const sdk = useEnsforge();
  const account = useAccount();
  const sign = useSignMessage();
  const hca = useHca(name);
  return {
    mutateAsync: async (input: Parameters<typeof normal.mutateAsync>[0]) => {
      const address = account.address;
      if (!address || account.chainId !== 11155111)
        throw new Error("Connect your wallet on Sepolia.");
      if (!navigator.locks)
        throw new Error("Use a browser supporting Web Locks for safe transaction submission.");
      return navigator.locks.request(
        `ens-record-update:${address.toLowerCase()}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) throw new Error("Another record update is in progress.");
          if (await reconcileOperation(address, sdk.config.publicClient))
            throw new Error(
              "Your previous update is confirmed. Refresh this profile before continuing.",
            );
          if (!hca.enabled || hca.walletPaid) return normal.mutateAsync(input);
          const readiness = await hca.getReadiness();
          if (!readiness?.ready) return normal.mutateAsync(input);
          const hcaAddress = readiness.hca;
          let signedHash: Hex | undefined;
          const client = createPimlicoClient({
            chain: sepolia,
            entryPoint: { address: sepoliaHcaDeployment.infrastructure.entryPoint, version: "0.7" },
            transport: custom(
              {
                request: async ({ method, params }) => {
                  if (method === "eth_sendUserOperation") {
                    if (!signedHash) throw new Error("Missing signed operation hash");
                    const operation = (params as [{ nonce?: Hex }] | undefined)?.[0];
                    if (!operation?.nonce || !/^0x[0-9a-f]+$/i.test(operation.nonce))
                      throw new Error("Missing operation nonce");
                    rememberOperation(address, {
                      hash: signedHash,
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
                      signedHash &&
                      error instanceof SponsorshipRejected &&
                      error.notSubmitted
                    )
                      forgetOperation(address, signedHash);
                    throw error;
                  }
                },
              },
              { retryCount: 0 },
            ),
          });
          const execution = pimlico({
            profile: sepoliaHcaDeployment,
            chain: sepolia,
            client,
            sponsorship: {},
            owner: {
              address,
              signMessage: async ({ message }) => {
                const current = getAccount(wagmiConfig);
                if (current.address !== address || current.chainId !== 11155111)
                  throw new Error("Wallet changed.");
                const signature = await sign.signMessageAsync({ account: address, message });
                if (typeof message === "string" || typeof message.raw !== "string")
                  throw new Error("Unexpected operation review");
                signedHash = message.raw;
                return signature;
              },
            },
          });
          const submission = await sdk.hca.executeHcaCalls({
            hca: hcaAddress,
            salt: 0n,
            authorization: { kind: "owner" },
            calls: input.calls,
            execution,
          });
          const result = await sdk.hca.waitForHcaExecution({
            submission,
            execution,
            timeout: 120_000,
            confirmations: 1,
            pollingInterval: 4_000,
            maxPollingInterval: 4_000,
          });
          if (result.status !== "succeeded")
            throw new Error(
              "Sponsored update is not confirmed. Check again before sending another transaction.",
            );
          // ENSForge has already checked the canonical receipt and matching EntryPoint event.
          if (signedHash) forgetOperation(address, signedHash);
          return { mode: "sequential" as const, status: "completed" as const };
        },
      );
    },
  };
}
