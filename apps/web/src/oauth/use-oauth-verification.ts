import { useCallback, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { Effect } from "effect";

import {
  getVerificationTypedData,
  hashTextRecordValue,
  oauthMethod,
  oauthTarget,
  parseVerificationDescriptor,
  validateVerificationClaim,
} from "@ens-social-verification/protocol";
import { useEnsforge, useTexts } from "@ensforge/react";
import { useAccount, useSignTypedData } from "wagmi";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { useClearVerificationAttempt } from "../hooks/use-clear-verification-attempt";
import { useRecordCalls } from "../sponsorship/use-record-calls";
import { wagmiConfig } from "../wallet";
import { oauthClient } from "./client";
import { oauthProviders, type OAuthProviderId } from "./providers";

export function useOAuthVerification(
  provider: OAuthProviderId,
  recordKey: string,
  name: string,
  callbackAttemptId?: string,
) {
  const search = useSearch({ from: "/$name" });
  const attemptId = search.oauthProvider === provider ? callbackAttemptId : undefined;
  const account = useAccount();
  const sdk = useEnsforge();
  const sendCalls = useRecordCalls(name, recordKey);
  const sign = useSignTypedData();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<
    "idle" | "connecting" | "signing" | "publishing" | "writing" | "checking"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const companion = `verification[text][${recordKey}]`;
  const records = useTexts({ name, keys: [recordKey, companion] });
  const { refresh: refreshRecords } = records;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const configuration = useQuery({
    queryKey: ["oauth", provider, "configuration"],
    queryFn: ({ signal }) => oauthClient.configuration(provider, signal),
    staleTime: 60_000,
    retry: false,
  });
  const status = useQuery({
    queryKey: ["oauth", provider, "status", name],
    queryFn: ({ signal }) => oauthClient.status(provider, name, signal),
    staleTime: 30_000,
    retry: false,
  });
  const attempt = useQuery({
    queryKey: ["oauth", "attempt", attemptId, account.address],
    queryFn: ({ signal }) => oauthClient.attempt(attemptId ?? "", signal),
    enabled: Boolean(attemptId && account.address && status.data?.status !== "verified"),
    retry: false,
  });
  useClearVerificationAttempt(
    "oauthAttempt",
    attemptId,
    phase === "idle" && !status.isError && status.data?.status === "verified",
  );
  const validUntil = status.data?.validUntil;
  useEffect(() => {
    if (!validUntil) return;
    const timer = setTimeout(
      () => {
        queryClient.setQueryData(["oauth", provider, "status", name], {
          status: "unverified",
          value: null,
          proofUri: null,
          validUntil: null,
          attestor: null,
          reason: "The attestation expired. Connect your account again.",
        });
      },
      Math.max(0, Math.min(2_147_483_647, Number(validUntil) * 1000 - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [validUntil, name, provider, queryClient]);
  const { refetch: refetchStatus } = status;
  const check = useCallback(async () => {
    setError(null);
    await refreshRecords();
    await refetchStatus();
  }, [refreshRecords, refetchStatus]);
  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setPhase("connecting");
    try {
      const result = await oauthClient.start(provider, name);
      if (!mounted.current) return;
      const url = new URL(result.authorizeUrl);
      const expected = new URL(oauthProviders[provider].authorizationUrl);
      if (
        url.origin !== expected.origin ||
        url.pathname !== expected.pathname ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error("Unexpected authorization destination.");
      window.location.assign(url.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't connect your account.");
      setPhase("idle");
    } finally {
      running.current = false;
    }
  }, [provider, name]);
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
        throw new Error("Sign in with the name owner's wallet.");
      const fresh = await oauthClient.attempt(attemptId);
      if (!fresh.claim || !fresh.identity || fresh.name !== name || fresh.provider !== provider)
        throw new Error("Complete authorization for this profile again.");
      const claim = await Effect.runPromise(validateVerificationClaim(fresh.claim));
      if (
        claim.authority.toLowerCase() !== address.toLowerCase() ||
        claim.name !== name ||
        claim.recordKey !== recordKey ||
        claim.method !== oauthMethod ||
        claim.valueHash !== hashTextRecordValue(fresh.identity.value) ||
        claim.target !== oauthTarget(fresh.identity, attemptId) ||
        Number(claim.validUntil) * 1000 <= Date.now()
      )
        throw new Error("The claim does not match this profile and wallet, or has expired.");
      let result = fresh.publication;
      if (!result) {
        assertAccount();
        setPhase("signing");
        const signature = await sign.signTypedDataAsync({
          ...getVerificationTypedData(claim),
          account: address,
        });
        assertAccount();
        setPhase("publishing");
        result = await oauthClient.publish(attemptId, signature);
        await queryClient.invalidateQueries({ queryKey: ["oauth", "attempt", attemptId] });
      }
      const descriptor = await Effect.runPromise(parseVerificationDescriptor(result.descriptor));
      if (
        result.name !== name ||
        result.provider !== provider ||
        result.recordKey !== recordKey ||
        result.value !== fresh.identity.value ||
        descriptor.method !== oauthMethod ||
        descriptor.proofUri !== result.proofUri
      )
        throw new Error("Published attestation does not match the approved account.");
      assertAccount();
      const live = await refreshRecords();
      if (
        live.find((record) => record.key === recordKey)?.value !== result.value ||
        live.find((record) => record.key === companion)?.value !== result.descriptor
      ) {
        assertAccount();
        setPhase("writing");
        const sent = await sendCalls.mutateAsync({
          account: address,
          calls: [
            sdk.records.setTexts.call({
              name,
              texts: [
                { key: recordKey, value: result.value },
                { key: companion, value: result.descriptor },
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
          throw new Error("Update is not confirmed. Check verification before sending again.");
        await refreshRecords();
      }
      setPhase("checking");
      const verified = await oauthClient.status(provider, name);
      queryClient.setQueryData(["oauth", provider, "status", name], verified);
      if (verified.status !== "verified")
        throw new Error(verified.reason ?? "Verification has not passed yet. Check again shortly.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't publish verification. Retry to reuse your attestation.",
      );
    } finally {
      running.current = false;
      setPhase("idle");
    }
  }, [
    account.address,
    attemptId,
    name,
    provider,
    recordKey,
    companion,
    queryClient,
    sdk,
    sendCalls,
    sign,
    refreshRecords,
  ]);
  return {
    configuration,
    status,
    attempt,
    attemptId,
    records,
    phase,
    error,
    start,
    publish,
    check,
  };
}
