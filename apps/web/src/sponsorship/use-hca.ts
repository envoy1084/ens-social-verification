import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sponsoredRecords } from "@ens-social-verification/protocol/schema";
import { useEnsforge } from "@ensforge/react";
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
    staleTime: 15_000,
    queryFn: async () => {
      if (!account.address) throw new Error("Connect your wallet");
      const hca = await sdk.hca.predictHcaAddress({ owner: account.address, salt: 0n });
      const deployment = await sdk.hca.getHca({ hca });
      if (deployment.status === "undeployed") return { hca, deployed: false, ready: false };
      const verified = await sdk.hca.verifyHca({ hca, expectedOwner: account.address, salt: 0n });
      const permissions = await sdk.capabilities.getRecordPermissions({
        name,
        account: hca,
        records: sponsoredRecords,
      });
      return {
        hca,
        deployed: true,
        ready:
          verified.deployed !== false &&
          permissions.records.length === sponsoredRecords.length &&
          permissions.records.every((record) => record.authorization.status === "authorized"),
      };
    },
  });
  return {
    state,
    enabled: configuration.data === true,
    walletPaid: preference.data,
    setWalletPaid: (value: boolean) => client.setQueryData(preferenceKey, value),
  };
}
