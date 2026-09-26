import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sponsoredRecords } from "@ens-social-verification/protocol/schema";
import { sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { useEnsforge } from "@ensforge/react";
import { isAddressEqual } from "viem";
import { useAccount } from "wagmi";
import { getAccount, getWalletClient } from "wagmi/actions";

import { env } from "../env";
import { wagmiConfig } from "../wallet";

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
    enabled: false,
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
        // The execution adapter and server also verify full deployment wiring.
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
      const result = await sdk.permissions.setRecordPermissions({
        walletAccount: address,
        walletClient,
        name,
        account: readiness.hca,
        records: sponsoredRecords,
        approved: true,
        allowScopeWidening: true,
        mode: "auto",
        atomicity: "preferred",
        confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
      });
      if (
        result.execution.mode === "sequential"
          ? result.execution.status !== "completed"
          : result.execution.status !== "confirmed"
      )
        throw new Error("Permission transaction is not confirmed yet.");
      assertAccount();
      const confirmed = await state.refetch({ cancelRefetch: false });
      if (confirmed.error) throw confirmed.error;
      assertAccount();
      if (!confirmed.data?.ready) throw new Error("HCA permissions are not confirmed. Try again.");
      return confirmed.data.hca;
    },
    enabled: configuration.data === true,
    get walletPaid() {
      return client.getQueryData<boolean>(preferenceKey) ?? preference.data;
    },
    setWalletPaid: (value: boolean) => client.setQueryData(preferenceKey, value),
  };
}
