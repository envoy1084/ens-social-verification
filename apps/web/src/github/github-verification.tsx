import { useCallback } from "react";

import { useText } from "@ensforge/react";
import { Button } from "@thenamespace/uikit/button";
import {
  HugeiconsIcon,
  CheckmarkCircle02Icon,
  ArrowUpRight01Icon,
} from "@thenamespace/uikit/icons";
import { Skeleton } from "@thenamespace/uikit/skeleton";
import { Tooltip } from "@thenamespace/uikit/tooltip";
import { useAccount } from "wagmi";

import { RemoveGithubDialog } from "./remove-github-dialog";
import { useGithubVerification } from "./use-github-verification";

const phaseLabels = {
  idle: "Sign & publish gist",
  connecting: "Opening GitHub...",
  signing: "Confirm signature in wallet...",
  creating: "Publishing your gist...",
  writing: "Confirm ENS update in wallet...",
  checking: "Checking live records...",
};

export function GithubVerification({
  name,
  owner,
  attemptId,
}: {
  name: string;
  owner?: string | null | undefined;
  attemptId?: string | undefined;
}) {
  const account = useAccount();
  const github = useGithubVerification(name, attemptId);
  const record = useText({ name, key: "com.github" });
  const isOwner = Boolean(
    owner && account.address?.toLowerCase() === owner.toLowerCase() && account.chainId === 11155111,
  );
  const verified = !github.status.isError && github.status.data?.status === "verified";
  const login = verified ? github.status.data?.login : record.data?.value;
  const ready = github.attempt.data?.name === name && github.attempt.data.status === "ready";
  const published = github.publication.data;
  const busy = github.phase !== "idle";
  const issue =
    github.error ||
    github.status.error?.message ||
    github.attempt.error?.message ||
    github.publication.error?.message;
  const { start, publish: publishProof } = github;
  const connect = useCallback(() => {
    void start();
  }, [start]);
  const publish = useCallback(() => {
    void publishProof();
  }, [publishProof]);
  const { check } = github;
  const retry = useCallback(() => {
    void check();
  }, [check]);

  return (
    <section className="mt-12" aria-labelledby="social-heading">
      <h2 id="social-heading" className="text-lg font-semibold">
        Social accounts
      </h2>
      <article className="record-card mt-4 flex min-h-28 max-w-2xl flex-col justify-center">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/brands/github.svg"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-semibold">GitHub</h3>
              {record.isInitial ? (
                <Skeleton className="mt-2 h-4 w-28" />
              ) : (
                <p className="mt-1 break-all text-sm text-muted">
                  {login ? `@${login}` : "No GitHub account linked"}
                </p>
              )}
            </div>
          </div>
          {verified && isOwner && account.address && github.status.data?.proofUri && login ? (
            <RemoveGithubDialog
              name={name}
              login={login}
              proofUri={github.status.data.proofUri}
              address={account.address}
            />
          ) : verified ? (
            <Tooltip>
              <Button
                variant="tertiary"
                size="sm"
                className="shrink-0 text-success"
                aria-label="Verified through a signed GitHub gist"
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} /> Verified
              </Button>
              <Tooltip.Content className="max-w-xs">
                Wallet signature and current ENSv2 ownership checked against the GitHub-owned gist.
                No operator attestation.
              </Tooltip.Content>
            </Tooltip>
          ) : (
            <span className="shrink-0 text-xs text-muted">
              {github.status.isPending
                ? "Checking..."
                : github.status.isError
                  ? "Check unavailable"
                  : "Not verified"}
            </span>
          )}
        </div>

        {verified && github.status.data?.proofUri ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <a
              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              href={github.status.data.proofUri}
              target="_blank"
              rel="noopener noreferrer"
            >
              View signed gist <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
              <span className="sr-only"> (opens in new tab)</span>
            </a>
            <span className="text-muted">
              Valid until{" "}
              {new Date(Number(github.status.data.validUntil) * 1000).toLocaleDateString()}
            </span>
          </div>
        ) : null}

        {isOwner && !verified ? (
          <div className="mt-5 border-t border-border pt-5">
            {ready || published ? (
              <p className="mb-4 text-sm leading-6 text-muted">
                {github.recordsSaved
                  ? "Both records are saved to ENS. Only the verification check remains; no new transaction is needed."
                  : published
                    ? "Your signed gist is ready. Save both records to ENS to finish."
                    : `Connected as @${github.attempt.data?.identity?.login}. Publish the signed proof, then approve the ENS record update.`}
              </p>
            ) : (
              <p className="mb-4 text-sm leading-6 text-muted">
                Connect GitHub to publish a public gist linking this ENS name and wallet to your
                account.
              </p>
            )}
            {github.configuration.data?.enabled ? (
              <div className="flex flex-wrap items-center gap-3">
                {github.recordsSaved ? null : ready || published ? (
                  <Button onPress={publish} isDisabled={busy || github.publication.isPending}>
                    {busy
                      ? phaseLabels[github.phase]
                      : published
                        ? "Save to ENS"
                        : "Sign & publish gist"}
                  </Button>
                ) : (
                  <Button
                    onPress={connect}
                    isDisabled={busy || Boolean(attemptId && github.attempt.isPending)}
                  >
                    <img
                      src="/brands/github.svg"
                      alt=""
                      width={18}
                      height={18}
                      className="size-[18px] shrink-0 brightness-0 invert"
                    />
                    {busy ? phaseLabels[github.phase] : "Connect GitHub"}
                  </Button>
                )}
                {(ready || published) && !busy ? (
                  <Button variant="tertiary" onPress={connect}>
                    Change GitHub account
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted">
                {github.configuration.isPending
                  ? "Checking GitHub availability..."
                  : "GitHub verification is temporarily unavailable."}
              </p>
            )}
          </div>
        ) : null}

        {issue ? (
          <p role="alert" className="mt-4 text-sm leading-6 break-words text-danger">
            {issue}
          </p>
        ) : null}
        {github.status.isError || github.error || (github.recordsSaved && !verified) ? (
          <Button
            className="mt-3"
            size="sm"
            variant="tertiary"
            isDisabled={busy || github.status.isFetching}
            onPress={retry}
          >
            Check verification again
          </Button>
        ) : null}
        {busy ? (
          <output className="sr-only" aria-live="polite">
            {phaseLabels[github.phase]}
          </output>
        ) : null}
      </article>
    </section>
  );
}
