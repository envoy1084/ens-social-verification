import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Effect } from "effect";

import {
  getVerificationTypedData,
  githubRecordKey,
  validateVerificationClaim,
  hashTextRecordValue,
  githubMethod,
} from "@ens-social-verification/protocol";
import { useEnsforge, useSendCalls, useTexts } from "@ensforge/react";
import { useAccount, useSignTypedData } from "wagmi";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { wagmiConfig } from "../wallet";
import { githubClient } from "./client";

type Phase = "idle" | "connecting" | "signing" | "creating" | "writing" | "checking";

export function useGithubVerification(name: string, attemptId?: string) {
  const account = useAccount();
  const sdk = useEnsforge();
  const sendCalls = useSendCalls();
  const sign = useSignTypedData();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const records = useTexts({ name, keys: [githubRecordKey, "verification[text][com.github]"] });
  const { refresh: refreshRecords } = records;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const configuration = useQuery({
    queryKey: ["github", "configuration"],
    queryFn: ({ signal }) => githubClient.configuration(signal),
    staleTime: 60_000,
    retry: false,
  });
  const status = useQuery({
    queryKey: ["github", "status", name],
    queryFn: ({ signal }) => githubClient.status(name, signal),
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const attempt = useQuery({
    queryKey: ["github", "attempt", attemptId, account.address],
    queryFn: ({ signal }) => githubClient.attempt(attemptId ?? "", signal),
    enabled: Boolean(attemptId && account.address),
    retry: false,
  });
  const publication = useQuery({
    queryKey: ["github", "publication", attemptId, account.address],
    queryFn: ({ signal }) => githubClient.publication(attemptId ?? "", signal),
    enabled: Boolean(attempt.data),
    retry: false,
  });
  const validUntil = status.data?.validUntil;
  const recordsSaved = Boolean(
    publication.data &&
    records.data?.find((record) => record.key === githubRecordKey)?.value ===
      publication.data.login &&
    records.data?.find((record) => record.key === "verification[text][com.github]")?.value ===
      publication.data.descriptor,
  );
  const { refetch: refetchStatus } = status;
  const check = useCallback(async () => {
    setError(null);
    await refetchStatus();
  }, [refetchStatus]);
  useEffect(() => {
    if (!validUntil) return;
    const timer = setTimeout(
      () => {
        queryClient.setQueryData(["github", "status", name], {
          status: "unverified",
          login: null,
          reason: "The signed proof expired",
          proofUri: null,
          validUntil: null,
        });
      },
      Math.max(0, Math.min(2_147_483_647, Number(validUntil) * 1000 - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [name, validUntil, queryClient]);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setPhase("connecting");
    try {
      const result = await githubClient.start(name);
      if (!mounted.current) return;
      const url = new URL(result.authorizeUrl);
      if (url.origin !== "https://github.com" || url.pathname !== "/login/oauth/authorize")
        throw new Error("Unexpected GitHub authorization URL");
      window.location.assign(url.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't connect GitHub. Try again.");
      setPhase("idle");
    } finally {
      running.current = false;
    }
  }, [name]);

  const publish = useCallback(async () => {
    if (running.current || !attemptId || !account.address) return;
    running.current = true;
    setError(null);
    const address = account.address;
    const assertAccount = () => {
      const current = getAccount(wagmiConfig);
      if (!mounted.current || current.address !== address || current.chainId !== 11155111)
        throw new Error("Wallet changed. Return to the original wallet on Sepolia.");
    };
    try {
      assertAccount();
      const session = await authClient.session();
      if (session?.address.toLowerCase() !== address.toLowerCase())
        throw new Error("Sign in again with the name owner's wallet.");
      let result = await githubClient.publication(attemptId);
      if (!result) {
        const fresh = await githubClient.attempt(attemptId);
        if (!fresh.claim || !fresh.identity || fresh.name !== name)
          throw new Error("Complete GitHub authorization again.");
        const claim = await Effect.runPromise(validateVerificationClaim(fresh.claim));
        if (
          claim.authority.toLowerCase() !== address.toLowerCase() ||
          claim.name !== name ||
          claim.recordKey !== githubRecordKey ||
          claim.method !== githubMethod ||
          claim.valueHash !== hashTextRecordValue(fresh.identity.login) ||
          claim.target !== `github:user:${fresh.identity.id}`
        )
          throw new Error("The GitHub claim does not match this profile and wallet.");
        assertAccount();
        setPhase("signing");
        const signature = await sign.signTypedDataAsync({
          ...getVerificationTypedData(claim),
          account: address,
        });
        assertAccount();
        setPhase("creating");
        result = await githubClient.publish(attemptId, signature);
        await queryClient.invalidateQueries({ queryKey: ["github", "publication", attemptId] });
      }
      if (result.name !== name) throw new Error("This publication belongs to another ENS name.");
      assertAccount();
      const live = await refreshRecords();
      if (
        live.find((record) => record.key === githubRecordKey)?.value !== result.login ||
        live.find((record) => record.key === "verification[text][com.github]")?.value !==
          result.descriptor
      ) {
        assertAccount();
        setPhase("writing");
        // One resolver multicall keeps both text records atomic, including on wallets without EIP-5792.
        const sent = await sendCalls.mutateAsync({
          account: address,
          calls: [
            sdk.records.setTexts.call({
              name,
              texts: [
                { key: githubRecordKey, value: result.login },
                { key: "verification[text][com.github]", value: result.descriptor },
              ],
            }),
          ],
          mode: "auto",
          atomicity: "preferred",
          simulation: "required",
          confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
        });
        assertAccount();
        if (sent.mode === "sequential" ? sent.status !== "completed" : sent.status !== "confirmed")
          throw new Error(
            "The wallet has not confirmed the update. Check verification before sending again.",
          );
        await refreshRecords();
      }
      setPhase("checking");
      const verified = await githubClient.status(name);
      queryClient.setQueryData(["github", "status", name], verified);
      if (verified.status !== "verified")
        throw new Error(
          verified.reason ??
            "Records were submitted but verification has not passed yet. Check again shortly.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't publish the verification. Your gist can be reused when retrying the ENS update.",
      );
    } finally {
      running.current = false;
      setPhase("idle");
    }
  }, [account.address, attemptId, name, queryClient, sdk, sendCalls, sign, refreshRecords]);

  return {
    configuration,
    status,
    attempt,
    publication,
    phase,
    error,
    start,
    publish,
    recordsSaved,
    check,
  };
}
