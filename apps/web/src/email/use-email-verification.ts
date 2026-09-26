import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Effect } from "effect";

import {
  emailMethod,
  emailClaim,
  emailSubject,
  emailRecordKey,
  emailVerificationKey,
  getVerificationTypedData,
  hashTextRecordValue,
  hashVerificationClaim,
  parseVerificationDescriptor,
  validateVerificationClaim,
} from "@ens-social-verification/protocol";
import type { EmailPublication, EmailStartResponse } from "@ens-social-verification/protocol/dto";
import type { VerificationClaim } from "@ens-social-verification/protocol/schema";
import { useEnsforge, useTexts } from "@ensforge/react";
import { useAccount, useSignTypedData } from "wagmi";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { useRecordCalls } from "../sponsorship/use-record-calls";
import { wagmiConfig } from "../wallet";
import { emailClient } from "./client";

type Phase = "idle" | "connecting" | "signing" | "publishing" | "writing" | "checking" | "removing";
type Pending = typeof EmailStartResponse.Type & { address: `0x${string}` };
type Ready = { claim: VerificationClaim; email: string; id: string; address: `0x${string}` };

export function useEmailVerification(name: string) {
  const account = useAccount();
  const sdk = useEnsforge();
  const sign = useSignTypedData();
  const sendCalls = useRecordCalls(name, emailRecordKey);
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [publication, setPublication] = useState<typeof EmailPublication.Type | null>(null);
  const [cleanupUri, setCleanupUri] = useState<string | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const records = useTexts({ name, keys: [emailRecordKey, emailVerificationKey] });
  const { refresh: refreshRecords } = records;
  const status = useQuery({
    queryKey: ["email", "status", name],
    queryFn: ({ signal }) => emailClient.status(name, signal),
    staleTime: 30_000,
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
  const linkedProof = useMemo(() => {
    const descriptor = records.data?.find((record) => record.key === emailVerificationKey)?.value;
    if (!descriptor) return null;
    try {
      const parsed = Effect.runSync(parseVerificationDescriptor(descriptor));
      return parsed.method === emailMethod ? (parsed.proofUri ?? null) : null;
    } catch {
      return null;
    }
  }, [records.data]);
  useEffect(() => {
    if (!validUntil) return;
    const timer = setTimeout(
      () => {
        queryClient.setQueryData(["email", "status", name], {
          status: "unverified",
          email: null,
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
    setPending(null);
    setError(null);
    setPhase("idle");
  }, []);
  const start = useCallback(
    async (email: string) => {
      if (running.current || !account.address) return;
      const address = account.address;
      const run = ++generation.current;
      running.current = true;
      setError(null);
      setPending(null);
      setPublication(null);
      setPhase("connecting");
      try {
        const result = await emailClient.start(name, email);
        if (run !== generation.current) return;
        if (
          result.intent.authority.toLowerCase() !== address.toLowerCase() ||
          result.intent.name !== name ||
          result.intent.email !== email
        )
          throw new Error("The challenge does not match this profile.");
        const expected = await Effect.runPromise(emailClaim(result.intent));
        if (result.subject !== emailSubject(expected))
          throw new Error("The email subject does not match the claim.");
        if (run !== generation.current) return;
        setPending({ ...result, address });
      } catch (cause) {
        if (run === generation.current)
          setError(cause instanceof Error ? cause.message : "Could not start email verification.");
      } finally {
        if (run === generation.current) {
          running.current = false;
          setPhase("idle");
        }
      }
    },
    [account.address, name],
  );
  const inbox = useQuery({
    queryKey: ["email", "inbox", pending?.id, account.address],
    queryFn: ({ signal }) => {
      if (!pending) throw new Error("Start an email challenge first.");
      return emailClient.complete(pending.id, signal);
    },
    enabled: Boolean(pending),
    refetchInterval: (query) => (query.state.data?.ready || query.state.error ? false : 10_000),
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
  });
  const ready = useMemo<Ready | null>(() => {
    if (pending && inbox.data?.ready && inbox.data.claim)
      return {
        id: pending.id,
        address: pending.address,
        claim: inbox.data.claim,
        email: inbox.data.email,
      };
    return null;
  }, [pending, inbox.data]);
  const check = useCallback(async () => {
    setError(null);
    if (pending && !ready) await inbox.refetch();
    await refreshRecords();
    await refetchStatus();
  }, [pending, ready, inbox, refreshRecords, refetchStatus]);
  const publish = useCallback(async () => {
    if (running.current || !ready || !pending) return;
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
        const expected = await Effect.runPromise(emailClaim(pending.intent));
        if (
          hashVerificationClaim(claim) !== hashVerificationClaim(expected) ||
          ready.email !== pending.intent.email ||
          claim.name !== name ||
          claim.authority.toLowerCase() !== ready.address.toLowerCase() ||
          claim.method !== emailMethod ||
          claim.recordKey !== emailRecordKey ||
          claim.valueHash !== hashTextRecordValue(ready.email)
        )
          throw new Error("The Email claim does not match this profile.");
        assertAccount();
        setPhase("signing");
        const signature = await sign.signTypedDataAsync({
          ...getVerificationTypedData(claim),
          account: ready.address,
        });
        assertAccount();
        setPhase("publishing");
        result = await emailClient.publish(ready.id, signature);
        assertAccount();
        setPublication(result);
      }
      if (result.name !== name || result.email !== ready.email)
        throw new Error("The published proof does not match this name and Email account.");
      const live = await refreshRecords();
      if (
        live.find((record) => record.key === emailRecordKey)?.value !== result.email ||
        live.find((record) => record.key === emailVerificationKey)?.value !== result.descriptor
      ) {
        assertAccount();
        setPhase("writing");
        const sent = await sendCalls.mutateAsync({
          account: ready.address,
          calls: [
            sdk.records.setTexts.call({
              name,
              texts: [
                { key: emailRecordKey, value: result.email },
                { key: emailVerificationKey, value: result.descriptor },
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
      const verdict = await emailClient.status(name);
      assertAccount();
      queryClient.setQueryData(["email", "status", name], verdict);
      if (verdict.status !== "verified")
        throw new Error(verdict.reason ?? "Records saved. Check verification again shortly.");
    } catch (cause) {
      if (run === generation.current)
        setError(cause instanceof Error ? cause.message : "Couldn't save Email verification.");
    } finally {
      if (run === generation.current) {
        running.current = false;
        setPhase("idle");
      }
    }
  }, [ready, pending, publication, name, sign, sendCalls, sdk, queryClient, refreshRecords]);
  const remove = useCallback(async () => {
    const proofUri = cleanupUri ?? linkedProof;
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
        const descriptor = await Effect.runPromise(
          parseVerificationDescriptor(
            live.find((record) => record.key === emailVerificationKey)?.value ?? "",
          ),
        );
        if (descriptor.method !== emailMethod || descriptor.proofUri !== proofUri)
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
                { key: emailRecordKey, value: "" },
                { key: emailVerificationKey, value: "" },
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
        queryClient.setQueryData(["email", "status", name], {
          status: "unverified",
          email: null,
          proofUri: null,
          validUntil: null,
          reason: "Records removed",
        });
      }
      const current = getAccount(wagmiConfig);
      if (run !== generation.current || current.address !== address || current.chainId !== 11155111)
        throw new Error("Return to the name owner's wallet on Sepolia.");
      await emailClient.removeProof(name, proofUri);
      if (run !== generation.current) return false;
      setCleanupUri(null);
      setPending(null);
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
    linkedProof,
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
    records.data?.find((record) => record.key === emailRecordKey)?.value === publication.email &&
    records.data?.find((record) => record.key === emailVerificationKey)?.value ===
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
    pending,
    inbox,
    start,
    cancel,
    publish,
    check,
    remove,
    cleanupPending: Boolean(cleanupUri),
    canRemove: Boolean(cleanupUri || linkedProof),
  };
}
