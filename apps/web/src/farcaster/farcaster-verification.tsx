import { useCallback, useState } from "react";

import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { CheckmarkCircle02Icon, HugeiconsIcon } from "@thenamespace/uikit/icons";
import { Modal } from "@thenamespace/uikit/modal";
import { Skeleton } from "@thenamespace/uikit/skeleton";
import { Tooltip } from "@thenamespace/uikit/tooltip";
import { QRCodeSVG } from "qrcode.react";
import { useAccount } from "wagmi";

import { env } from "../env";
import { useFarcasterVerification } from "./use-farcaster-verification";

const phaseLabels = {
  idle: "Sign & save to ENS",
  connecting: "Opening Farcaster...",
  approving: "Waiting for Farcaster...",
  signing: "Confirm signature in wallet...",
  publishing: "Publishing proof...",
  writing: "Confirm ENS update in wallet...",
  checking: "Checking live records...",
  removing: "Removing...",
};

export function FarcasterVerification({
  name,
  owner,
}: {
  name: string;
  owner?: string | null | undefined;
}) {
  const account = useAccount();
  return (
    <FarcasterAccount
      key={`${name}:${account.address}:${account.chainId}`}
      name={name}
      owner={owner}
    />
  );
}

function FarcasterAccount({ name, owner }: { name: string; owner?: string | null | undefined }) {
  const account = useAccount();
  const verification = useFarcasterVerification(name);
  const [removeOpen, setRemoveOpen] = useState(false);
  const isOwner = Boolean(
    owner && account.address?.toLowerCase() === owner.toLowerCase() && account.chainId === 11155111,
  );
  const verified = !verification.status.isError && verification.status.data?.status === "verified";
  const username = verified
    ? verification.status.data?.username
    : verification.records.data?.find((record) => record.key === "xyz.farcaster")?.value;
  const busy = verification.phase !== "idle";
  const issue = verification.error || verification.status.error?.message;
  const { start, publish, check, cancel, remove } = verification;
  const connect = useCallback(() => {
    void start();
  }, [start]);
  const save = useCallback(() => {
    void publish();
  }, [publish]);
  const retry = useCallback(() => {
    void check();
  }, [check]);
  const onConnectOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancel();
    },
    [cancel],
  );
  const onRemoveOpenChange = useCallback(
    (open: boolean) => {
      if (!busy) setRemoveOpen(open);
    },
    [busy],
  );
  const closeRemoval = useCallback(() => setRemoveOpen(false), []);
  const confirmRemoval = useCallback(() => {
    void remove().then((removed) => {
      if (removed) setRemoveOpen(false);
      return removed;
    });
  }, [remove]);
  return (
    <article className="record-card mt-4 flex min-h-28 max-w-2xl flex-col justify-center">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/brands/farcaster.svg"
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0"
          />
          <div className="min-w-0">
            <h3 className="font-semibold">Farcaster</h3>
            {verification.records.isInitial ? (
              <Skeleton className="mt-2 h-4 w-28" />
            ) : (
              <p className="mt-1 break-all text-sm text-muted">
                {username
                  ? username.startsWith("fid:")
                    ? `FID ${username.slice(4)}`
                    : `@${username}`
                  : "No Farcaster account linked"}
              </p>
            )}
          </div>
        </div>
        {verified && isOwner ? (
          <AlertDialog isOpen={removeOpen} onOpenChange={onRemoveOpenChange}>
            <Button
              variant="tertiary"
              size="sm"
              className="shrink-0 text-success"
              aria-label="Verified Farcaster account: remove verification"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
              Verified
            </Button>
            <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
              <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                  <AlertDialog.Header>
                    <AlertDialog.Heading>Remove Farcaster verification?</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body className="space-y-3 text-sm leading-6">
                    <p>
                      This clears <strong>xyz.farcaster</strong> and{" "}
                      <strong>verification[text][xyz.farcaster]</strong> from{" "}
                      <strong className="break-all">{name}</strong> in one wallet transaction.
                    </p>
                    <p className="text-muted">
                      The signed public proof is kept. Restoring both records can reactivate it.
                    </p>
                    {issue ? (
                      <p role="alert" className="text-danger">
                        {issue}
                      </p>
                    ) : null}
                  </AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button variant="tertiary" onPress={closeRemoval} isDisabled={busy}>
                      Cancel
                    </Button>
                    <Button variant="danger" onPress={confirmRemoval} isDisabled={busy}>
                      {busy ? "Removing..." : "Remove verification"}
                    </Button>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        ) : verified ? (
          <Tooltip>
            <Button
              variant="tertiary"
              size="sm"
              className="shrink-0 text-success"
              aria-label="Verified through Farcaster and ENS wallet signatures"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
              Verified
            </Button>
            <Tooltip.Content className="max-w-xs">
              Farcaster signer authorization and current ENS ownership checked. No operator
              attestation.
            </Tooltip.Content>
          </Tooltip>
        ) : (
          <span className="shrink-0 text-xs text-muted">
            {verification.status.isPending
              ? "Checking..."
              : verification.status.isError
                ? "Check unavailable"
                : "Not verified"}
          </span>
        )}
      </div>
      {verified && verification.status.data?.proofUri ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <a
            href={
              import.meta.env.DEV &&
              ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.serverUrl).hostname)
                ? new URL(new URL(verification.status.data.proofUri).pathname, env.serverUrl).href
                : verification.status.data.proofUri
            }
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            View signed proof<span className="sr-only"> (opens in new tab)</span>
          </a>
          <span className="text-muted">
            Valid until{" "}
            {new Date(Number(verification.status.data.validUntil) * 1000).toLocaleDateString()}
          </span>
        </div>
      ) : null}
      {isOwner && !verified ? (
        <div className="mt-5 border-t border-border pt-5">
          {verification.ready ? (
            <p className="mb-4 text-sm leading-6 text-muted">
              {verification.recordsSaved
                ? "Both records are saved. Only the verification check remains."
                : verification.publication
                  ? "Your signed proof is ready. Save both records to ENS to finish."
                  : `Connected as ${verification.ready.username.startsWith("fid:") ? verification.ready.username : `@${verification.ready.username}`}. Sign the public proof, then approve the ENS update.`}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {verification.recordsSaved ? null : verification.ready ? (
              <Button onPress={save} isDisabled={busy}>
                {busy
                  ? phaseLabels[verification.phase]
                  : verification.publication
                    ? "Save to ENS"
                    : "Sign & save to ENS"}
              </Button>
            ) : (
              <Button onPress={connect} isDisabled={busy}>
                {busy ? phaseLabels[verification.phase] : "Connect Farcaster"}
              </Button>
            )}
            {verification.ready && !busy ? (
              <Button variant="tertiary" onPress={connect}>
                Change Farcaster account
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {issue && !removeOpen ? (
        <p role="alert" className="mt-4 text-sm leading-6 break-words text-danger">
          {issue}
        </p>
      ) : null}
      {issue || (verification.recordsSaved && !verified) ? (
        <Button
          variant="tertiary"
          size="sm"
          className="mt-3 self-start"
          onPress={retry}
          isDisabled={busy || verification.status.isFetching}
        >
          Check verification again
        </Button>
      ) : null}
      <Modal isOpen={Boolean(verification.url)} onOpenChange={onConnectOpenChange}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Approve in Farcaster</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col items-center gap-5">
                {verification.url ? (
                  <>
                    <QRCodeSVG
                      value={verification.url}
                      size={224}
                      marginSize={4}
                      title="Scan to approve this ENS verification in Farcaster"
                      className="max-w-full"
                    />
                    <a
                      className="font-medium text-accent hover:underline"
                      href={verification.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Farcaster<span className="sr-only"> (opens in new tab)</span>
                    </a>
                  </>
                ) : null}
                <output className="text-sm text-muted">Waiting for your approval...</output>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={cancel}>
                  Cancel
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </article>
  );
}
