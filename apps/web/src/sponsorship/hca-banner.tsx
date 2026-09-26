import { useCallback, useState, useSyncExternalStore } from "react";

import { sponsoredRecords } from "@ens-social-verification/protocol/schema";
import { useEnsforge } from "@ensforge/react";
import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { Label } from "@thenamespace/uikit/label";
import { Switch } from "@thenamespace/uikit/switch";
import { useAccount } from "wagmi";
import { getAccount, getWalletClient } from "wagmi/actions";

import { wagmiConfig } from "../wallet";
import {
  reconcileOperation,
  hasPendingOperation,
  subscribePendingOperation,
} from "./pending-operation";
import { useHca } from "./use-hca";

export function HcaBanner({ name, owner }: { name: string; owner: string | null | undefined }) {
  const account = useAccount();
  const sdk = useEnsforge();
  const hca = useHca(name);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("Preparing setup...");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useSyncExternalStore(subscribePendingOperation, () =>
    hasPendingOperation(account.address),
  );
  const setup = useCallback(async () => {
    if (!account.address || busy) return;
    const address = account.address;
    const assertAccount = () => {
      const current = getAccount(wagmiConfig);
      if (current.address !== address || current.chainId !== 11155111)
        throw new Error("Wallet changed. Return to the original wallet.");
    };
    setBusy(true);
    setStep("Preparing setup...");
    setMessage(null);
    try {
      const readiness = await hca.getReadiness();
      if (!readiness) throw new Error("Could not check HCA deployment.");
      if (readiness.ready) {
        hca.setWalletPaid(false);
        setOpen(false);
        return;
      }
      assertAccount();
      const walletClient = await getWalletClient(wagmiConfig, { chainId: 11155111 });
      if (!readiness.deployed) {
        setStep("Deploying HCA...");
        await sdk.hca.deployHca({
          owner: address,
          account: address,
          walletClient,
          salt: 0n,
          confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
        });
      }
      assertAccount();
      setStep("Authorizing HCA...");
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
      setStep("Checking permissions...");
      const confirmed = await hca.state.refetch({ cancelRefetch: false });
      if (confirmed.error || !confirmed.data?.ready)
        throw new Error(
          "Setup was submitted, but permissions could not be confirmed. Retry lookup.",
        );
      hca.setWalletPaid(false);
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup could not finish.");
    } finally {
      setBusy(false);
    }
  }, [account.address, busy, hca, name, sdk]);
  const check = useCallback(async () => {
    if (!account.address) return;
    setBusy(true);
    try {
      setMessage(
        (await reconcileOperation(account.address, sdk.config.publicClient))
          ? "Update confirmed. Refresh your profile."
          : "No pending sponsored update.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check update.");
    } finally {
      setBusy(false);
    }
  }, [account.address, sdk]);
  const openSetup = useCallback(() => setOpen(true), []);
  const closeSetup = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);
  const changeSponsorship = useCallback((selected: boolean) => hca.setWalletPaid(!selected), [hca]);
  const retryHca = useCallback(() => {
    void hca.state.refetch();
  }, [hca.state]);
  const checkPending = useCallback(() => {
    void check();
  }, [check]);
  const confirmSetup = useCallback(() => {
    void setup();
  }, [setup]);
  if (
    !hca.enabled ||
    !account.address ||
    account.address.toLowerCase() !== owner?.toLowerCase() ||
    account.chainId !== 11155111
  )
    return null;
  return (
    <aside
      className="mt-5 border-y border-border py-3 text-sm"
      aria-label="Transaction sponsorship"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {hca.walletPaid
            ? "Wallet-paid updates."
            : hca.state.isPending
              ? "Checking HCA..."
              : hca.state.isError
                ? hca.state.error.message
                : hca.state.data?.ready
                  ? "HCA ready for sponsored updates."
                  : "Wallet gas until HCA setup."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            isSelected={!hca.walletPaid}
            onChange={changeSponsorship}
            isDisabled={busy}
            size="sm"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Label>Sponsor updates</Label>
            </Switch.Content>
          </Switch>
          {!hca.walletPaid && hca.state.data && !hca.state.isError && !hca.state.data.ready ? (
            <Button size="sm" onPress={openSetup} isDisabled={busy || hca.state.isPending}>
              {hca.state.data.deployed ? "Authorize HCA" : "Set up HCA"}
            </Button>
          ) : null}
          {pending ? (
            <Button variant="tertiary" size="sm" onPress={checkPending} isDisabled={busy}>
              Check pending
            </Button>
          ) : null}
          {!hca.walletPaid && hca.state.isError ? (
            <Button
              size="sm"
              variant="tertiary"
              onPress={retryHca}
              isDisabled={busy || hca.state.isFetching}
            >
              Retry lookup
            </Button>
          ) : null}
        </div>
      </div>
      {!open && message ? <output className="mt-2 block text-muted">{message}</output> : null}
      <AlertDialog isOpen={open} onOpenChange={setOpen}>
        <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Enable sponsored updates?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="space-y-3 text-sm leading-6">
                <p>
                  Your wallet pays for HCA deployment and permission setup. Subsequent eligible
                  record updates are sponsored.
                </p>
                <p>
                  Your HCA remains controlled by your wallet. Depending on the resolver, this grants
                  permissions across the name or resolver, not just these social records. ENS
                  ownership does not change.
                </p>
                {message ? (
                  <p role="alert" className="text-danger">
                    {message}
                  </p>
                ) : null}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="tertiary" onPress={closeSetup} isDisabled={busy}>
                  Not now
                </Button>
                <Button onPress={confirmSetup} isDisabled={busy}>
                  {busy
                    ? step
                    : hca.state.data?.deployed
                      ? "Authorize HCA"
                      : "Deploy and authorize"}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </aside>
  );
}
