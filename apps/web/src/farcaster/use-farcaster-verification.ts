import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Effect } from "effect";

import {
  farcasterMethod,
  farcasterRecordKey,
  farcasterVerificationKey,
  getVerificationTypedData,
  hashTextRecordValue,
  validateVerificationClaim,
} from "@ens-social-verification/protocol";
import type {
  FarcasterPublication,
  FarcasterReadyResponse,
} from "@ens-social-verification/protocol/dto";
import { useEnsforge, useSendCalls, useTexts } from "@ensforge/react";
import { createAppClient, viemConnector } from "@farcaster/auth-client";
import { useAccount, useSignTypedData } from "wagmi";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { wagmiConfig } from "../wallet";
import { farcasterClient } from "./client";

// Only relay actions run here; signature verification and authenticated Optimism reads run on the server.
const relay = createAppClient({
  ethereum: viemConnector({ rpcUrl: "https://mainnet.optimism.io" }),
});
type Phase =
  | "idle"
  | "connecting"
  | "approving"
  | "signing"
  | "publishing"
  | "writing"
  | "checking"
  | "removing";
type Ready = typeof FarcasterReadyResponse.Type & { id: string; address: `0x${string}` };

export function useFarcasterVerification(name: string) {
  const account = useAccount();
  const sdk = useEnsforge();
  const sign = useSignTypedData();
  const sendCalls = useSendCalls();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [publication, setPublication] = useState<typeof FarcasterPublication.Type | null>(null);
  const [cleanupUri, setCleanupUri] = useState<string | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const records = useTexts({ name, keys: [farcasterRecordKey, farcasterVerificationKey] });
  const { refresh: refreshRecords } = records;
  const status = useQuery({
    queryKey: ["farcaster", "status", name],
    queryFn: ({ signal }) => farcasterClient.status(name, signal),
    staleTime: 30_000,
    refetchInterval: 300_000,
    retry: false,
  });
  const { refetch: refetchStatus } = status;
  useEffect(() => {
    generation.current = 0;
    return () => {
      generation.current = -1;
    };
  }, []);
  const validUntil = status.data?.validUntil;
  useEffect(() => {
    if (!validUntil) return;
    const timer = setTimeout(
      () => {
        queryClient.setQueryData(["farcaster", "status", name], {
          status: "unverified",
          username: null,
          proofUri: null,
          validUntil: null,
          reason: "The signed proof expired",
        });
      },
      Math.max(0, Math.min(2_147_483_647, Number(validUntil) * 1000 - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [name, validUntil, queryClient]);
  const cancel = useCallback(() => {
    generation.current++;
    running.current = false;
    setUrl(null);
    setPhase("idle");
  }, []);
  const start = useCallback(async () => {
    if (running.current || !account.address) return;
    const address = account.address;
    const run = ++generation.current;
    running.current = true;
    setError(null);
    setReady(null);
    setPublication(null);
    setPhase("connecting");
    try {
      const pending = await farcasterClient.start(name);
      if (run !== generation.current) return;
      if (
        pending.intent.authority.toLowerCase() !== address.toLowerCase() ||
        pending.intent.name !== name
      )
        throw new Error("The request does not match your wallet and name.");
      const channel = await relay.createChannel({
        domain: pending.intent.domain,
        siweUri: pending.intent.uri,
        nonce: pending.nonce,
        requestId: pending.id,
        expirationTime: new Date(Number(pending.intent.validUntil) * 1000).toISOString(),
        acceptAuthAddress: true,
      });
      if (run !== generation.current) return;
      if (channel.isError) throw new Error("Couldn't open Farcaster. Try connecting again.");
      const link = new URL(channel.data.url);
      if (link.protocol !== "https:" || !["farcaster.xyz", "warpcast.com"].includes(link.hostname))
        throw new Error("Unexpected Farcaster sign-in URL.");
      setUrl(link.href);
      setPhase("approving");
      const approval = await relay.watchStatus({
        channelToken: channel.data.channelToken,
        timeout: 300_000,
        interval: 2000,
      });
      if (run !== generation.current) return;
      if (approval.isError || !approval.data.message || !approval.data.signature)
        throw new Error("Farcaster approval expired or was cancelled. Connect again.");
      const result = await farcasterClient.complete(pending.id, {
        message: approval.data.message,
        signature: approval.data.signature,
        username: approval.data.username ?? "",
      });
      if (run !== generation.current) return;
      setReady({ ...result, id: pending.id, address });
      setUrl(null);
    } catch (cause) {
      if (run === generation.current) {
        setError(cause instanceof Error ? cause.message : "Couldn't connect Farcaster.");
        setUrl(null);
      }
    } finally {
      if (run === generation.current) {
        running.current = false;
        setPhase("idle");
      }
    }
  }, [account.address, name]);
  const check = useCallback(async () => {
    setError(null);
    await refreshRecords();
    await refetchStatus();
  }, [refreshRecords, refetchStatus]);
  const publish = useCallback(async () => {
    if (running.current || !ready) return;
    running.current = true;
    setError(null);
    const run = generation.current;
    const assertAccount = () => {
      const current = getAccount(wagmiConfig);
      if (
        run !== generation.current ||
        current.address !== ready.address ||
        current.chainId !== 11155111
      )
        throw new Error("Wallet changed. Return to the original wallet on Sepolia.");
    };
    try {
      assertAccount();
      const session = await authClient.session();
      if (session?.address.toLowerCase() !== ready.address.toLowerCase())
        throw new Error("Sign in again with the name owner's wallet.");
      let result = publication;
      if (!result) {
        const claim = await Effect.runPromise(validateVerificationClaim(ready.claim));
        if (
          claim.name !== name ||
          claim.authority.toLowerCase() !== ready.address.toLowerCase() ||
          claim.method !== farcasterMethod ||
          claim.recordKey !== farcasterRecordKey ||
          claim.valueHash !== hashTextRecordValue(ready.username)
        )
          throw new Error("The Farcaster claim does not match this profile.");
        assertAccount();
        setPhase("signing");
        const signature = await sign.signTypedDataAsync({
          ...getVerificationTypedData(claim),
          account: ready.address,
        });
        assertAccount();
        setPhase("publishing");
        result = await farcasterClient.publish(ready.id, signature);
        assertAccount();
        setPublication(result);
      }
      if (result.name !== name || result.username !== ready.username)
        throw new Error("The published proof does not match this name and Farcaster account.");
      const live = await refreshRecords();
      if (
        live.find((record) => record.key === farcasterRecordKey)?.value !== result.username ||
        live.find((record) => record.key === farcasterVerificationKey)?.value !== result.descriptor
      ) {
        assertAccount();
        setPhase("writing");
        const sent = await sendCalls.mutateAsync({
          account: ready.address,
          calls: [
            sdk.records.setTexts.call({
              name,
              texts: [
                { key: farcasterRecordKey, value: result.username },
                { key: farcasterVerificationKey, value: result.descriptor },
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
            "The update isn't confirmed yet. Check verification before sending again.",
          );
      }
      setPhase("checking");
      await refreshRecords();
      const verdict = await farcasterClient.status(name);
      assertAccount();
      queryClient.setQueryData(["farcaster", "status", name], verdict);
      if (verdict.status !== "verified")
        throw new Error(verdict.reason ?? "Records saved. Check verification again shortly.");
    } catch (cause) {
      if (run === generation.current)
        setError(cause instanceof Error ? cause.message : "Couldn't save Farcaster verification.");
    } finally {
      if (run === generation.current) {
        running.current = false;
        setPhase("idle");
      }
    }
  }, [ready, publication, name, sign, sendCalls, sdk, queryClient, refreshRecords]);
  const remove = useCallback(async () => {
    const proofUri = cleanupUri ?? status.data?.proofUri;
    if (running.current || !account.address || !proofUri) return false;
    running.current = true;
    setPhase("removing");
    setError(null);
    const address = account.address;
    const run = generation.current;
    let recordsRemoved = Boolean(cleanupUri);
    try {
      const session = await authClient.session();
      if (session?.address.toLowerCase() !== address.toLowerCase())
        throw new Error("Sign in with the name owner's wallet first.");
      if (!cleanupUri) {
        const live = await refreshRecords();
        const verdict = await farcasterClient.status(name);
        if (
          verdict.status !== "verified" ||
          verdict.proofUri !== proofUri ||
          live.find((record) => record.key === farcasterRecordKey)?.value !== verdict.username
        )
          throw new Error("The verification changed. Refresh before removing it.");
        const current = getAccount(wagmiConfig);
        if (
          run !== generation.current ||
          current.address !== address ||
          current.chainId !== 11155111
        )
          throw new Error("Return to the name owner's wallet on Sepolia.");
        const sent = await sendCalls.mutateAsync({
          account: address,
          calls: [
            sdk.records.setTexts.call({
              name,
              texts: [
                { key: farcasterRecordKey, value: "" },
                { key: farcasterVerificationKey, value: "" },
              ],
            }),
          ],
          mode: "auto",
          atomicity: "preferred",
          simulation: "required",
          confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
        });
        if (sent.mode === "sequential" ? sent.status !== "completed" : sent.status !== "confirmed")
          throw new Error("Removal is not confirmed. Check the transaction before retrying.");
        if (run !== generation.current) return false;
        recordsRemoved = true;
        setCleanupUri(proofUri);
        queryClient.setQueryData(["farcaster", "status", name], {
          status: "unverified",
          username: null,
          proofUri: null,
          validUntil: null,
          reason: "Records removed",
        });
      }
      const current = getAccount(wagmiConfig);
      if (run !== generation.current || current.address !== address || current.chainId !== 11155111)
        throw new Error("Return to the name owner's wallet on Sepolia.");
      await farcasterClient.removeProof(name, proofUri);
      if (run !== generation.current) return false;
      setCleanupUri(null);
      setReady(null);
      setPublication(null);
      await check();
      return true;
    } catch (cause) {
      if (run === generation.current)
        setError(
          recordsRemoved
            ? "ENS records were removed. Hosted proof cleanup could not finish; retry cleanup without another transaction."
            : cause instanceof Error
              ? cause.message
              : "Couldn't remove verification.",
        );
      return false;
    } finally {
      if (run === generation.current) {
        running.current = false;
        setPhase("idle");
      }
    }
  }, [
    account.address,
    status.data,
    cleanupUri,
    name,
    refreshRecords,
    sendCalls,
    sdk,
    check,
    queryClient,
  ]);
  const recordsSaved = Boolean(
    publication &&
    records.data?.find((record) => record.key === farcasterRecordKey)?.value ===
      publication.username &&
    records.data?.find((record) => record.key === farcasterVerificationKey)?.value ===
      publication.descriptor,
  );
  return {
    status,
    records,
    ready,
    publication,
    recordsSaved,
    phase,
    error,
    url,
    start,
    cancel,
    publish,
    check,
    remove,
    cleanupPending: Boolean(cleanupUri),
  };
}
