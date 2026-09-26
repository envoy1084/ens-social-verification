import { useCallback, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Effect } from "effect";

import { formatVerificationDescriptor, oauthMethod } from "@ens-social-verification/protocol";
import { useEnsforge } from "@ensforge/react";
import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { getAddress } from "viem";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { useRecordCalls } from "../sponsorship/use-record-calls";
import { wagmiConfig } from "../wallet";
import { oauthClient } from "./client";

export function RemoveOAuthDialog({
  provider,
  recordKey,
  name,
  value,
  proofUri,
  address,
  onRecordsChanged,
}: {
  provider: string;
  recordKey: string;
  name: string;
  value: string;
  proofUri: string;
  address: string;
  onRecordsChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const sdk = useEnsforge();
  const sendCalls = useRecordCalls(name, recordKey);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (running.current) return;
      setOpen(next);
      if (!next && cleared) {
        void onRecordsChanged();
        void queryClient.invalidateQueries({ queryKey: ["oauth", provider, "status", name] });
        void navigate({ to: "/$name", params: { name }, search: {}, replace: true });
      }
    },
    [cleared, queryClient, provider, name, navigate, onRecordsChanged],
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const remove = useCallback(async () => {
    if (running.current || done) return;
    running.current = true;
    setBusy(true);
    setError(null);
    const assertAccount = () => {
      const current = getAccount(wagmiConfig);
      if (current.address?.toLowerCase() !== address.toLowerCase() || current.chainId !== 11155111)
        throw new Error("Return to the name owner's wallet on Sepolia.");
    };
    try {
      assertAccount();
      const session = await authClient.session();
      if (session?.address.toLowerCase() !== address.toLowerCase())
        throw new Error("Sign in with the name owner's wallet.");
      const companion = `verification[text][${recordKey}]`;
      const records = await sdk.records.getTexts({ name, keys: [recordKey, companion] });
      if (records.some((record) => record.value)) {
        const descriptor = await Effect.runPromise(
          formatVerificationDescriptor({ authorityVersion: 2, method: oauthMethod, proofUri }),
        );
        if (
          records.find((record) => record.key === recordKey)?.value !== value ||
          records.find((record) => record.key === companion)?.value !== descriptor
        )
          throw new Error("The records changed. Refresh before removing this verification.");
        assertAccount();
        const sent = await sendCalls.mutateAsync({
          account: getAddress(address),
          calls: [
            sdk.records.setTexts.call({
              name,
              texts: [
                { key: recordKey, value: "" },
                { key: companion, value: "" },
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
      }
      setCleared(true);
      assertAccount();
      await oauthClient.remove(provider, name, proofUri);
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Removal failed. Retry to finish revocation.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [done, address, sdk, name, provider, recordKey, value, proofUri, sendCalls]);
  const confirm = useCallback(() => {
    void remove();
  }, [remove]);
  return (
    <AlertDialog isOpen={open} onOpenChange={onOpenChange}>
      <Button size="sm" variant="tertiary" className="text-danger">
        Remove verification
      </Button>
      <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {done ? "Verification removed" : "Remove verification?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-4 text-sm leading-6">
              <p>
                {done
                  ? "Both records are cleared and the attestation is revoked."
                  : cleared
                    ? "Records are cleared. Finish revoking the attestation; no new transaction is needed."
                    : `Clear ${recordKey} and its verification record from ${name}, then revoke the hosted attestation? Your social account is not deleted.`}
              </p>
              {error ? (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={close} isDisabled={busy}>
                {done ? "Done" : "Cancel"}
              </Button>
              {!done ? (
                <Button variant="danger" onPress={confirm} isDisabled={busy}>
                  {busy ? "Removing..." : cleared ? "Retry revocation" : "Remove verification"}
                </Button>
              ) : null}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
