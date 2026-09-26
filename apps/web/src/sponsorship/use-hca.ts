import { useQuery } from "@tanstack/react-query";

import { sponsoredRecordKeys } from "@ens-social-verification/protocol/schema";
import { multicallResolverAbi } from "@ensforge/contracts";
import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { permissionedResolverV2Abi } from "@ensforge/contracts/v2";
import { useEnsforge } from "@ensforge/react";
import { useEventCallback, useLocalStorage } from "usehooks-ts";
import { encodeFunctionData, isAddressEqual, toHex } from "viem";
import { packetToBytes, normalize } from "viem/ens";
import { useAccount } from "wagmi";
import { getAccount, getWalletClient } from "wagmi/actions";

import { env } from "../env";
import { wagmiConfig } from "../wallet";

export function useHca(name: string, recordKey?: string) {
  const sdk = useEnsforge();
  const account = useAccount();
  const [sponsored, setSponsored] = useLocalStorage("ens-sponsored-updates", false);
  // Record updates can resume after proof signing with an older hook result.
  const prefersWalletGas = useEventCallback(() => sponsored !== true);
  const configuration = useQuery({
    queryKey: ["sponsorship", "configuration"],
    queryFn: async () => {
      const response = await fetch(`${env.serverUrl}/sponsorship/configuration`);
      if (!response.ok) throw new Error("Sponsorship unavailable");
      const result: unknown = await response.json();
      return Boolean(
        result && typeof result === "object" && "enabled" in result && result.enabled === true,
      );
    },
    staleTime: 60_000,
    retry: false,
  });
  const state = useQuery({
    queryKey: ["sponsorship", "hca", account.address, name, recordKey],
    enabled: false,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!account.address) throw new Error("Connect your wallet");
      if (!recordKey || !sponsoredRecordKeys.some((key) => key === recordKey))
        throw new Error("Unsupported sponsored record.");
      const records = [recordKey, `verification[text][${recordKey}]`].map((key) => ({
        type: "text" as const,
        key,
      }));
      let stage = "HCA address";
      try {
        const hca = await sdk.hca.predictHcaAddress({ owner: account.address, salt: 0n });
        stage = "HCA deployment or permissions";
        const [deployment, permissions] = await Promise.all([
          sdk.hca.getHca({ hca }),
          sdk.capabilities.getRecordPermissions({ name, account: hca, records }),
        ]);
        // The server verifies full deployment wiring before sponsorship.
        if (
          deployment.status === "deployed" &&
          (!isAddressEqual(deployment.owner, account.address) ||
            !isAddressEqual(
              deployment.implementation,
              sepoliaHcaDeployment.contracts.standaloneImplementation,
            ) ||
            deployment.accountId !== sepoliaHcaDeployment.generation.accountId)
        )
          throw new Error("Unsupported HCA deployment");
        if (
          permissions.records.length !== records.length ||
          permissions.records.some((record) => !record.supported)
        )
          throw new Error("Resolver does not support the required permissions.");
        const missing = permissions.records
          .filter((record) => record.authorization.status !== "authorized")
          .map((record) => record.record);
        return {
          hca,
          deployed: deployment.status === "deployed",
          missing,
          ready: deployment.status === "deployed" && missing.length === 0,
        };
      } catch (cause) {
        throw new Error(
          `${stage} lookup failed. Try again or turn off sponsorship to use wallet gas.`,
          { cause },
        );
      }
    },
  });
  return {
    prepareForUpdate: async () => {
      const address = account.address;
      if (!address) throw new Error("Connect your wallet on Sepolia.");
      const assertAccount = () => {
        const current = getAccount(wagmiConfig);
        if (current.address !== address || current.chainId !== 11155111)
          throw new Error("Wallet changed. Return to the original wallet on Sepolia.");
      };
      assertAccount();
      const fresh = await state.refetch({ cancelRefetch: false });
      if (fresh.error) throw fresh.error;
      assertAccount();
      const readiness = fresh.data;
      if (!readiness) throw new Error("Could not check HCA deployment.");
      if (readiness.ready) return readiness.hca;
      if (
        !window.confirm(
          "Set up sponsored updates? Your wallet pays for HCA deployment if needed and permission setup. Permissions may cover the whole name or resolver. Your wallet keeps control and ENS ownership does not change.",
        )
      )
        throw new Error("Setup cancelled. Turn off sponsorship to use wallet gas.");
      assertAccount();
      const walletClient = await getWalletClient(wagmiConfig, { chainId: 11155111 });
      if (!readiness.deployed)
        await sdk.hca.deployHca({
          owner: address,
          account: address,
          walletClient,
          salt: 0n,
          confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
        });
      assertAccount();
      if (readiness.missing.length > 0) {
        const [resolver, protocol] = await Promise.all([
          sdk.capabilities.getResolverCapabilities({ name }),
          sdk.name.getProtocol({ name }),
        ]);
        if (!resolver.address || resolver.inherited)
          throw new Error("A directly attached resolver is required.");
        const resolverAddress = resolver.address;
        if (protocol !== "v2") throw new Error("Sponsored setup requires an ENSv2 name.");
        const grants =
          resolver.authorization === "owner-delegate"
            ? (
                await sdk.batch.prepareCalls({
                  account: address,
                  walletClient,
                  calls: [
                    sdk.permissions.setResolverDelegateApproval.call({
                      name,
                      delegate: readiness.hca,
                      approved: true,
                    }),
                  ],
                })
              ).map((call) => {
                if (!isAddressEqual(call.to, resolverAddress) || call.value !== 0n || !call.data)
                  throw new Error("Permission calls do not match the resolver.");
                return call.data;
              })
            : resolver.authorization === "role"
              ? readiness.missing.map((record) => {
                  if (record.type !== "text")
                    throw new Error("Only text permissions are supported.");
                  const setter = encodeFunctionData({
                    abi: permissionedResolverV2Abi,
                    functionName: "setText",
                    args: [toHex(packetToBytes(normalize(name))), record.key, ""],
                  });
                  return encodeFunctionData({
                    abi: permissionedResolverV2Abi,
                    functionName: "grantSetterRoles",
                    args: [setter, readiness.hca],
                  });
                })
              : [];
        if (grants.length === 0) throw new Error("Unsupported resolver permission model.");
        // Resolver multicall preserves the owner sender even without wallet batching support.
        const data = encodeFunctionData({
          abi: multicallResolverAbi,
          functionName: "multicall",
          args: [grants],
        });
        assertAccount();
        await sdk.config.publicClient.call({ account: address, to: resolver.address, data });
        assertAccount();
        const hash = await walletClient.sendTransaction({
          account: address,
          to: resolver.address,
          data,
        });
        const receipt = await sdk.config.publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 120_000,
        });
        if (receipt.status !== "success") throw new Error("Permission transaction reverted.");
      }
      assertAccount();
      const confirmed = await state.refetch({ cancelRefetch: false });
      if (confirmed.error) throw confirmed.error;
      assertAccount();
      if (!confirmed.data?.ready) throw new Error("HCA permissions are not confirmed. Try again.");
      return confirmed.data.hca;
    },
    enabled: configuration.data === true,
    walletPaid: sponsored !== true,
    prefersWalletGas,
    setWalletPaid: (value: boolean) => setSponsored(!value),
  };
}
