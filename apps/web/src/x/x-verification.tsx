import { useCallback, useState } from "react";

import { xProofPost } from "@ens-social-verification/protocol";
import { useText } from "@ensforge/react";
import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import {
  HugeiconsIcon,
  CheckmarkCircle02Icon,
  ArrowUpRight01Icon,
} from "@thenamespace/uikit/icons";
import { Skeleton } from "@thenamespace/uikit/skeleton";
import { Tooltip } from "@thenamespace/uikit/tooltip";
import { useAccount } from "wagmi";

import { ConnectXDialog } from "./connect-x-dialog";
import { xProofLink } from "./proof-link";
import { RemoveXDialog } from "./remove-x-dialog";
import { useXVerification } from "./use-x-verification";

const phaseLabels = {
  idle: "Sign & publish post",
  connecting: "Opening X...",
  signing: "Confirm signature in wallet...",
  creating: "Publishing your post...",
  writing: "Confirm ENS update in wallet...",
  checking: "Checking live records...",
};

export function XVerification({
  name,
  owner,
  attemptId,
}: {
  name: string;
  owner?: string | null | undefined;
  attemptId?: string | undefined;
}) {
  const account = useAccount();
  return (
    <XAccount
      key={`${name}:${account.address}:${account.chainId}:${attemptId}`}
      name={name}
      owner={owner}
      attemptId={attemptId}
    />
  );
}

function XAccount({
  name,
  owner,
  attemptId,
}: {
  name: string;
  owner?: string | null | undefined;
  attemptId?: string | undefined;
}) {
  const account = useAccount();
  const x = useXVerification(name, attemptId);
  const [publishOpen, setPublishOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const record = useText({ name, key: "com.twitter" });
  const isOwner = Boolean(
    owner && account.address?.toLowerCase() === owner.toLowerCase() && account.chainId === 11155111,
  );
  const verified = !x.status.isError && x.status.data?.status === "verified";
  const login = verified ? x.status.data?.login : record.data?.value;
  const ready = x.attempt.data?.name === name && x.attempt.data.status === "ready";
  const published = x.publication.data;
  const busy = x.phase !== "idle";
  const issue =
    x.error || x.status.error?.message || x.attempt.error?.message || x.publication.error?.message;
  const { start, publish: publishProof } = x;
  const connect = useCallback(() => {
    setConnectOpen(false);
    void start();
  }, [start]);
  const reviewAccess = useCallback(() => setConnectOpen(true), []);
  const closeAccess = useCallback(() => setConnectOpen(false), []);
  const publish = useCallback(() => {
    setPublishOpen(false);
    void publishProof();
  }, [publishProof]);
  const reviewPost = useCallback(() => setPublishOpen(true), []);
  const closePreview = useCallback(() => setPublishOpen(false), []);
  const { check } = x;
  const retry = useCallback(() => {
    void check();
  }, [check]);

  return (
    <article className="record-card mt-4 flex min-h-28 w-full flex-col justify-center">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/brands/x.svg" alt="" width={32} height={32} className="size-8 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold">X</h3>
            {record.isInitial ? (
              <Skeleton className="mt-2 h-4 w-28" />
            ) : (
              <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">
                {login ? `@${login}` : "No X account linked"}
              </p>
            )}
          </div>
        </div>
        {verified && isOwner && account.address && x.status.data?.proofUri && login ? (
          <RemoveXDialog
            name={name}
            login={login}
            proofUri={x.status.data.proofUri}
            address={account.address}
          />
        ) : verified ? (
          <Tooltip>
            <Button
              variant="tertiary"
              size="sm"
              className="shrink-0 text-success"
              aria-label="Verified through a signed X post"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} /> Verified
            </Button>
            <Tooltip.Content className="max-w-xs">
              Wallet signature and current ENSv2 ownership checked against the X-owned post. No
              operator attestation.
            </Tooltip.Content>
          </Tooltip>
        ) : (
          <span className="shrink-0 text-xs text-muted">
            {x.status.isPending
              ? "Checking..."
              : x.status.isError
                ? "Check unavailable"
                : "Not verified"}
          </span>
        )}
      </div>

      {verified && x.status.data?.proofUri ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <a
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            href={xProofLink(x.status.data.proofUri)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View signed proof <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
            <span className="sr-only"> (opens in new tab)</span>
          </a>
          <span className="text-muted">
            Valid until {new Date(Number(x.status.data.validUntil) * 1000).toLocaleDateString()}
          </span>
        </div>
      ) : null}

      {isOwner && !verified ? (
        <div className="mt-5 border-t border-border pt-5">
          {ready || published ? (
            <p className="mb-4 text-sm leading-6 text-muted">
              {x.recordsSaved
                ? "Both records are saved to ENS. Only the verification check remains; no new transaction is needed."
                : published
                  ? "Your signed post is ready. Save both records to ENS to finish."
                  : `Connected as @${x.attempt.data?.identity?.login}. Publish the signed proof, then approve the ENS record update.`}
            </p>
          ) : null}
          {x.configuration.data?.enabled ? (
            <div className="flex flex-wrap items-center gap-3">
              {x.recordsSaved ? null : ready || published ? (
                <Button
                  onPress={published ? publish : reviewPost}
                  isDisabled={busy || x.publication.isPending}
                >
                  {busy ? phaseLabels[x.phase] : published ? "Save to ENS" : "Sign & publish post"}
                </Button>
              ) : (
                <Button
                  onPress={reviewAccess}
                  isDisabled={busy || Boolean(attemptId && x.attempt.isPending)}
                >
                  {busy ? phaseLabels[x.phase] : "Connect X"}
                </Button>
              )}
              {(ready || published) && !busy ? (
                <Button variant="tertiary" onPress={reviewAccess}>
                  Change X account
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {x.configuration.isPending
                ? "Checking X availability..."
                : "X verification is temporarily unavailable."}
            </p>
          )}
        </div>
      ) : null}

      {issue ? (
        <p role="alert" className="mt-4 text-sm leading-6 break-words text-danger">
          {issue}
        </p>
      ) : null}
      {x.status.isError || x.error || (x.recordsSaved && !verified) ? (
        <Button
          className="mt-3"
          size="sm"
          variant="tertiary"
          isDisabled={busy || x.status.isFetching}
          onPress={retry}
        >
          Check verification again
        </Button>
      ) : null}
      {busy ? (
        <output className="sr-only" aria-live="polite">
          {phaseLabels[x.phase]}
        </output>
      ) : null}
      <ConnectXDialog
        name={name}
        isOpen={connectOpen}
        onOpenChange={setConnectOpen}
        onCancel={closeAccess}
        onContinue={connect}
        busy={busy}
      />
      <AlertDialog isOpen={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Publish proof on X?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="space-y-4 text-sm leading-6">
                <p>
                  This public post will be published as{" "}
                  <strong>@{x.attempt.data?.identity?.login}</strong> to link{" "}
                  <strong className="break-all">{name}</strong>. Your wallet signs the claim before
                  publication.
                </p>
                <blockquote className="whitespace-pre-wrap break-all border-l-2 border-border pl-4 font-mono text-xs">
                  {x.attempt.data?.claim ? xProofPost(x.attempt.data.claim) : ""}
                </blockquote>
                <p>
                  Keep this post public and unchanged for verification to work. Deleting or editing
                  it breaks verification.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="tertiary" onPress={closePreview}>
                  Cancel
                </Button>
                <Button onPress={publish} isDisabled={busy || !ready}>
                  Sign &amp; publish post
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </article>
  );
}
