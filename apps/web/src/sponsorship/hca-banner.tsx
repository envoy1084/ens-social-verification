import { useCallback, useState, type ChangeEvent } from "react";

import { sponsoredRecords } from "@ens-social-verification/protocol/schema";
import { useEnsforge } from "@ensforge/react";
import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { useAccount } from "wagmi";
import { getAccount } from "wagmi/actions";

import { wagmiConfig } from "../wallet";
import { reconcileOperation } from "./pending-operation";
import { useHca } from "./use-hca";

export function HcaBanner({ name, owner }: { name: string; owner: string | null | undefined }) {
  const account = useAccount();
  const sdk = useEnsforge();
  const hca = useHca(name);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const setup = useCallback(async () => {
    if (!account.address || busy) return;
    const address = account.address;
    const assertAccount = () => {
      const current = getAccount(wagmiConfig);
      if (current.address !== address || current.chainId !== 11155111)
        throw new Error("Wallet changed. Return to the original wallet.");
    };
    setBusy(true);
    setMessage(null);
    try {
      const fresh = await hca.state.refetch();
      if (!fresh.data) throw new Error("Could not check HCA deployment.");
      assertAccount();
      if (!fresh.data.deployed) {
        const deployment = await sdk.hca.deployHca({ owner: address, account: address, salt: 0n });
        if (deployment.hash) {
          const receipt = await sdk.config.publicClient.waitForTransactionReceipt({
            hash: deployment.hash,
          });
          if (receipt.status !== "success") throw new Error("HCA deployment failed.");
        }
      }
      assertAccount();
      const result = await sdk.permissions.setRecordPermissions({
        walletAccount: address,
        name,
        account: fresh.data.hca,
        records: sponsoredRecords,
        approved: true,
        allowScopeWidening: true,
        mode: "sequential",
        atomicity: "none",
        confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
      });
      if (
        result.execution.mode === "sequential"
          ? result.execution.status !== "completed"
          : result.execution.status !== "confirmed"
      )
        throw new Error("Permission transaction is not confirmed yet.");
      await hca.state.refetch();
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
  const changeSponsorship = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => hca.setWalletPaid(!event.target.checked),
    [hca],
  );
  const useWalletGas = useCallback(() => hca.setWalletPaid(true), [hca]);
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
          {hca.state.data?.ready && !hca.walletPaid
            ? "Record updates are sponsored."
            : "Enable sponsored record updates with your HCA."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {!hca.state.data?.ready ? (
            <Button size="sm" onPress={openSetup} isDisabled={busy || hca.state.isPending}>
              Set up HCA
            </Button>
          ) : null}
          {hca.state.data?.ready ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!hca.walletPaid} onChange={changeSponsorship} />
              Sponsor updates
            </label>
          ) : null}
          <Button variant="tertiary" size="sm" onPress={checkPending} isDisabled={busy}>
            Check pending
          </Button>
          {hca.state.isError ? (
            <Button size="sm" variant="tertiary" onPress={useWalletGas}>
              Use wallet gas
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
                  {busy ? "Confirm in wallet..." : "Deploy and authorize"}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </aside>
  );
}
