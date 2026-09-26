import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sponsoredRecords } from "@ens-social-verification/protocol/schema";
import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { useEnsforge } from "@ensforge/react";
import { isAddressEqual } from "viem";
import { useAccount } from "wagmi";

import { env } from "../env";

export function useHca(name: string) {
  const sdk = useEnsforge();
  const account = useAccount();
  const client = useQueryClient();
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
  const preferenceKey = ["sponsorship", "wallet-paid", account.address, name];
  const preference = useQuery({
    queryKey: preferenceKey,
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
  });
  const state = useQuery({
    queryKey: ["sponsorship", "hca", account.address, name],
    enabled: Boolean(configuration.data && account.address && account.chainId === 11155111),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!account.address) throw new Error("Connect your wallet");
      let stage = "HCA address";
      try {
        const hca = await sdk.hca.predictHcaAddress({ owner: account.address, salt: 0n });
        stage = "HCA deployment";
        const deployment = await sdk.hca.getHca({ hca });
        if (deployment.status === "undeployed") return { hca, deployed: false, ready: false };
        // Display-only readiness. The execution adapter and server verify full deployment wiring.
        if (
          !isAddressEqual(deployment.owner, account.address) ||
          !isAddressEqual(
            deployment.implementation,
            sepoliaHcaDeployment.contracts.standaloneImplementation,
          ) ||
          deployment.accountId !== sepoliaHcaDeployment.generation.accountId
        )
          throw new Error("Unsupported HCA deployment");
        stage = "HCA permissions";
        const permissions = await sdk.capabilities.getRecordPermissions({
          name,
          account: hca,
          records: sponsoredRecords,
        });
        return {
          hca,
          deployed: true,
          ready:
            permissions.records.length === sponsoredRecords.length &&
            permissions.records.every((record) => record.authorization.status === "authorized"),
        };
      } catch (cause) {
        throw new Error(
          `${stage} lookup failed. Retry lookup or turn off sponsorship to use wallet gas.`,
          { cause },
        );
      }
    },
  });
  return {
    state,
    getReadiness: async () => {
      // This selects the execution path; the adapter and server revalidate authorization.
      if (state.data && !state.isStale && Date.now() - state.dataUpdatedAt < 60_000)
        return state.data;
      const fresh = await state.refetch({ cancelRefetch: false });
      if (fresh.error) throw fresh.error;
      return fresh.data;
    },
    enabled: configuration.data === true,
    walletPaid: preference.data,
    setWalletPaid: (value: boolean) => client.setQueryData(preferenceKey, value),
  };
}
