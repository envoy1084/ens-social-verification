import { useCallback, useState } from "react";

import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { HugeiconsIcon, CheckmarkCircle02Icon } from "@thenamespace/uikit/icons";
import { Skeleton } from "@thenamespace/uikit/skeleton";
import { Tooltip } from "@thenamespace/uikit/tooltip";
import { useAccount } from "wagmi";

import { oauthProofLink } from "./client";
import { oauthProviders, type OAuthProviderId } from "./providers";
import { RemoveOAuthDialog } from "./remove-oauth-dialog";
import { useOAuthVerification } from "./use-oauth-verification";

const labels = {
  idle: "Sign & save to ENS",
  connecting: "Opening authorization...",
  signing: "Confirm wallet signature...",
  publishing: "Publishing attestation...",
  writing: "Confirm ENS update...",
  checking: "Checking verification...",
};

export function OAuthVerification(props: {
  provider: OAuthProviderId;
  name: string;
  owner?: string | null | undefined;
  attemptId?: string | undefined;
}) {
  const account = useAccount();
  return (
    <OAuthAccount
      key={`${props.provider}:${props.name}:${account.address}:${account.chainId}:${props.attemptId}`}
      {...props}
    />
  );
}

function OAuthAccount({
  provider,
  name,
  owner,
  attemptId,
}: {
  provider: OAuthProviderId;
  name: string;
  owner?: string | null | undefined;
  attemptId?: string | undefined;
}) {
  const account = useAccount();
  const definition = oauthProviders[provider];
  const oauth = useOAuthVerification(provider, definition.recordKey, name, attemptId);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isOwner = Boolean(
    owner && account.address?.toLowerCase() === owner.toLowerCase() && account.chainId === 11155111,
  );
  const verified = !oauth.status.isError && oauth.status.data?.status === "verified";
  const value = verified
    ? oauth.status.data?.value
    : oauth.records.data?.find((record) => record.key === definition.recordKey)?.value;
  const ready =
    oauth.attempt.data?.provider === provider &&
    oauth.attempt.data.name === name &&
    oauth.attempt.data.status === "ready";
  const published = ready ? oauth.attempt.data?.publication : null;
  const busy = oauth.phase !== "idle";
  const attestor = oauth.status.data?.attestor ?? oauth.configuration.data?.attestor;
  const issue =
    oauth.error ??
    oauth.status.error?.message ??
    (!verified && oauth.attemptId && oauth.attempt.error
      ? `${definition.label} connection attempt: ${oauth.attempt.error.message}`
      : null) ??
    oauth.configuration.error?.message;
  const { start, publish, check } = oauth;
  const connect = useCallback(() => {
    void start();
  }, [start]);
  const review = useCallback(() => setReviewOpen(true), []);
  const close = useCallback(() => setReviewOpen(false), []);
  const confirm = useCallback(() => {
    setReviewOpen(false);
    void publish();
  }, [publish]);
  const retry = useCallback(() => {
    void check();
  }, [check]);
  return (
    <article className="record-card mt-4 flex min-h-28 w-full flex-col justify-center">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <HugeiconsIcon
            icon={definition.icon}
            size={32}
            className={`shrink-0 ${definition.iconClassName}`}
          />
          <div className="min-w-0">
            <h3 className="font-semibold">{definition.label}</h3>
            {oauth.records.isInitial ? (
              <Skeleton className="mt-2 h-4 w-28" />
            ) : (
              <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">
                {value ? `@${value}` : `No ${definition.label} account linked`}
              </p>
            )}
          </div>
        </div>
        {verified && isOwner && account.address && value && oauth.status.data?.proofUri ? (
          <RemoveOAuthDialog
            provider={provider}
            recordKey={definition.recordKey}
            name={name}
            value={value}
            proofUri={oauth.status.data.proofUri}
            address={account.address}
            onRecordsChanged={check}
          />
        ) : verified ? (
          <Tooltip>
            <Button size="sm" variant="tertiary" className="shrink-0 text-success">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} /> Verified
            </Button>
            <Tooltip.Content className="max-w-xs break-words">
              Account access attested by {attestor}. This verification trusts that attestor.
            </Tooltip.Content>
          </Tooltip>
        ) : (
          <span className="shrink-0 text-xs text-muted">
            {oauth.status.isPending
              ? "Checking..."
              : oauth.status.isError
                ? "Check unavailable"
                : "Not verified"}
          </span>
        )}
      </div>
      {verified && oauth.status.data?.proofUri ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span title={attestor ?? undefined}>
            Verified by {attestor?.slice(0, 6)}...{attestor?.slice(-4)}
          </span>
          <a
            className="font-semibold text-accent hover:underline"
            href={oauthProofLink(oauth.status.data.proofUri)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View attestation<span className="sr-only"> (opens in new tab)</span>
          </a>
          <span>
            Valid until {new Date(Number(oauth.status.data.validUntil) * 1000).toLocaleDateString()}
          </span>
        </div>
      ) : null}
      {isOwner && !verified ? (
        <div className="mt-5 border-t border-border pt-5">
          {ready ? (
            <p className="mb-4 text-sm text-muted">
              {published
                ? "Your attestation is ready. Save both records to ENS."
                : `Connected as @${oauth.attempt.data?.identity?.value}.`}
            </p>
          ) : null}
          {oauth.configuration.data?.enabled ? (
            <div className="flex flex-wrap gap-3">
              <Button
                onPress={ready ? (published ? confirm : review) : connect}
                isDisabled={busy || Boolean(oauth.attemptId && oauth.attempt.isPending)}
              >
                {busy
                  ? labels[oauth.phase]
                  : ready
                    ? published
                      ? "Save to ENS"
                      : "Review verification"
                    : `Connect ${definition.label}`}
              </Button>
              {ready ? (
                <Button variant="tertiary" onPress={connect} isDisabled={busy}>
                  Change account
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {oauth.configuration.isPending
                ? "Checking availability..."
                : `${definition.label} verification is temporarily unavailable.`}
            </p>
          )}
        </div>
      ) : null}
      {issue ? (
        <p role="alert" className="mt-4 text-sm break-words text-danger">
          {issue}
        </p>
      ) : null}
      {issue || (published && !verified) ? (
        <Button
          size="sm"
          variant="tertiary"
          className="mt-3 self-start"
          onPress={retry}
          isDisabled={busy || oauth.status.isFetching}
        >
          Check verification again
        </Button>
      ) : null}
      {busy ? (
        <output aria-live="polite" className="sr-only">
          {labels[oauth.phase]}
        </output>
      ) : null}
      <AlertDialog isOpen={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>Verify your {definition.label} account?</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="space-y-4 text-sm leading-6">
                <p>
                  Link <strong>@{oauth.attempt.data?.identity?.value}</strong> to{" "}
                  <strong className="break-all">{name}</strong>. Your {definition.label} account ID,
                  username, ENS name and signatures will be public.
                </p>
                <p>
                  This method trusts our attestor's account check. Nothing is posted to{" "}
                  {definition.label}.
                </p>
                <p className="break-all text-xs text-muted">Attestor: {attestor}</p>
                <p>Your wallet will request a signature, then an ENS record update.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="tertiary" onPress={close}>
                  Cancel
                </Button>
                <Button onPress={confirm} isDisabled={!ready || busy}>
                  Sign &amp; save to ENS
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </article>
  );
}
