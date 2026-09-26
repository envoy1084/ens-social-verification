import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";

import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { CheckmarkCircle02Icon, HugeiconsIcon, Mail01Icon } from "@thenamespace/uikit/icons";
import { Skeleton } from "@thenamespace/uikit/skeleton";
import { useAccount } from "wagmi";

import { CopyButton } from "../components/copy-button";
import { env } from "../env";
import { emailClient } from "./client";
import { useEmailVerification } from "./use-email-verification";

export function EmailVerification({
  name,
  owner,
}: {
  name: string;
  owner?: string | null | undefined;
}) {
  const account = useAccount();
  return (
    <EmailAccount key={`${name}:${account.address}:${account.chainId}`} name={name} owner={owner} />
  );
}

function EmailAccount({ name, owner }: { name: string; owner?: string | null | undefined }) {
  const account = useAccount();
  const verification = useEmailVerification(name);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const isOwner = Boolean(
    owner && account.address?.toLowerCase() === owner.toLowerCase() && account.chainId === 11155111,
  );
  const value = verification.records.data?.find((record) => record.key === "email")?.value;
  const verified = !verification.status.isError && verification.status.data?.status === "verified";
  const busy = verification.phase !== "idle";
  const issue =
    verification.error ?? verification.inbox.error?.message ?? verification.status.error?.message;
  const pending = verification.pending;
  const publication = verification.publication;
  const proofUri = verification.status.data?.proofUri;
  const { start, cancel, publish, check, remove, ready } = verification;
  const openRemoval = useCallback(() => setRemoveOpen(true), []);
  const closeRemoval = useCallback(() => setRemoveOpen(false), []);
  const changeRemoval = useCallback(
    (open: boolean) => {
      if (!busy) setRemoveOpen(open);
    },
    [busy],
  );
  const changeEmail = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
    [],
  );
  const changeConsent = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setConsent(event.target.checked),
    [],
  );
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setConsent(false);
      setPreview(null);
      setPreviewError(null);
      const split = email.lastIndexOf("@");
      const normalized =
        split < 0
          ? email.trim()
          : `${email.slice(0, split).trim()}@${email
              .slice(split + 1)
              .trim()
              .toLowerCase()}`;
      void start(normalized);
    },
    [email, start],
  );
  const review = useCallback(() => {
    if (!ready) return;
    setPreviewLoading(true);
    setPreviewError(null);
    void emailClient
      .preview(ready.id)
      .then((result) => {
        setPreview(
          new TextDecoder().decode(
            Uint8Array.from(atob(result.rawEmail), (character) => character.charCodeAt(0)),
          ),
        );
        return result;
      })
      .catch(() => setPreviewError("Could not load the original email. Try again."))
      .finally(() => setPreviewLoading(false));
  }, [ready]);
  const save = useCallback(() => {
    if (consent || publication) void publish();
  }, [consent, publication, publish]);
  const restart = useCallback(() => {
    cancel();
    setConsent(false);
    setPreview(null);
  }, [cancel]);
  const retry = useCallback(() => {
    void check();
  }, [check]);
  const confirmRemoval = useCallback(() => {
    void remove().then((removed) => {
      if (removed) setRemoveOpen(false);
      return removed;
    });
  }, [remove]);
  if (!isOwner && !value) return null;

  return (
    <section className="mt-12" aria-labelledby="contact-heading">
      <h2 id="contact-heading" className="text-lg font-semibold">
        Contact
      </h2>
      <article className="record-card mt-4 flex min-h-28 w-full flex-col justify-center">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <HugeiconsIcon icon={Mail01Icon} size={32} className="shrink-0 text-accent" />
            <div className="min-w-0">
              <h3 className="font-semibold">Email</h3>
              {verification.records.isInitial ? (
                <Skeleton className="mt-2 h-4 w-28" />
              ) : (
                <p className="mt-1 break-all text-sm text-muted">{value || "No email linked"}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {value ? <CopyButton value={value} label="Copy email address" /> : null}
            {verified || (isOwner && verification.canRemove) ? (
              isOwner ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  className="text-success"
                  onPress={openRemoval}
                  aria-label="Remove email verification"
                >
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                  {verification.cleanupPending
                    ? "Cleanup pending"
                    : verified
                      ? "Verified"
                      : "Remove"}
                </Button>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-xs text-success"
                  title="Sender-domain DKIM and current ENS wallet signature checked. Domain administrators remain trusted."
                >
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                  Verified
                </span>
              )
            ) : (
              <span className="text-xs text-muted">
                {verification.status.isPending
                  ? "Checking..."
                  : verification.status.isError
                    ? "Check unavailable"
                    : "Not verified"}
              </span>
            )}
          </div>
        </div>
        {verified && proofUri ? (
          <a
            className="mt-4 self-start text-sm font-medium text-accent hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            href={
              import.meta.env.DEV &&
              ["localhost", "127.0.0.1"].includes(new URL(env.serverUrl).hostname)
                ? new URL(new URL(proofUri).pathname, env.serverUrl).href
                : proofUri
            }
          >
            View signed proof<span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : null}
        {isOwner && !verified && !verification.cleanupPending ? (
          <div className="mt-5 border-t border-border pt-5">
            {!pending ? (
              <form className="space-y-3" onSubmit={submit}>
                <label className="block text-sm font-medium" htmlFor="verification-email">
                  Email address
                </label>
                <input
                  id="verification-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={changeEmail}
                  className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-offset-2 focus:outline-2 focus:outline-accent"
                  placeholder="you@example.com"
                  disabled={busy}
                />
                <Button type="submit" isDisabled={busy}>
                  {busy ? "Preparing challenge..." : "Verify email"}
                </Button>
              </form>
            ) : !verification.ready ? (
              <div className="space-y-4 text-sm">
                <p className="leading-6">
                  Send a new email from{" "}
                  <strong className="break-all">{pending.intent.email}</strong>. Leave out
                  attachments and personal messages.
                </p>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-muted">To</dt>
                    <dd className="flex items-center justify-between gap-2">
                      <span className="break-all">{pending.intent.recipient}</span>
                      <CopyButton
                        value={pending.intent.recipient}
                        label="Copy verification recipient"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Subject</dt>
                    <dd className="flex items-center justify-between gap-2">
                      <span className="break-all font-mono text-xs">{pending.subject}</span>
                      <CopyButton value={pending.subject} label="Copy verification subject" />
                    </dd>
                  </div>
                </dl>
                <a
                  className="inline-flex min-h-11 items-center font-medium text-accent hover:underline"
                  href={`mailto:${pending.intent.recipient}?subject=${encodeURIComponent(pending.subject)}&body=${encodeURIComponent("Verify my ENS email record.")}`}
                >
                  Open email app
                </a>
                <output className="block text-muted">
                  {verification.inbox.data?.reason ??
                    "Waiting for your signed email. This challenge expires in 30 minutes."}
                </output>
                <Button variant="tertiary" size="sm" onPress={verification.cancel}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-sm leading-6">
                <p>
                  {verification.recordsSaved
                    ? "Both records are saved. Check verification to finish."
                    : publication
                      ? "Proof published. Approve the ENS record update to finish."
                      : "Your email passed the DKIM check."}
                </p>
                {!publication ? (
                  <>
                    <p className="text-muted">
                      Publishing makes your original email public, including its address, headers,
                      body, and any signature or attachments. Your mail provider and domain
                      administrators remain trusted. Downloaded copies cannot be erased.
                    </p>
                    <Button
                      variant="tertiary"
                      size="sm"
                      isDisabled={previewLoading}
                      onPress={review}
                    >
                      {previewLoading ? "Loading original..." : "Review original email"}
                    </Button>
                    {previewError ? (
                      <p role="alert" className="text-danger">
                        {previewError}
                      </p>
                    ) : null}
                    {preview ? (
                      <pre className="max-h-64 overflow-auto rounded-lg border border-border p-3 text-xs whitespace-pre-wrap break-all">
                        {preview}
                      </pre>
                    ) : null}
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={changeConsent}
                        className="mt-1 size-4 shrink-0 accent-accent"
                        disabled={busy}
                      />
                      <span>I agree to publish this original email as public proof.</span>
                    </label>
                  </>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  {!verification.recordsSaved ? (
                    <Button isDisabled={busy || (!publication && !consent)} onPress={save}>
                      {busy
                        ? verification.phase === "writing"
                          ? "Confirm ENS update..."
                          : verification.phase === "signing"
                            ? "Confirm signature..."
                            : "Checking proof..."
                        : publication
                          ? "Save to ENS"
                          : "Sign & publish"}
                    </Button>
                  ) : null}
                  {!busy ? (
                    <Button variant="tertiary" onPress={restart}>
                      Start again
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}
        {issue ? (
          <p role="alert" className="mt-4 text-sm leading-6 text-danger">
            {issue}
          </p>
        ) : null}
        {issue || (verification.recordsSaved && !verified) ? (
          <Button
            variant="tertiary"
            size="sm"
            className="mt-3 self-start"
            isDisabled={busy}
            onPress={retry}
          >
            Check verification again
          </Button>
        ) : null}
        <AlertDialog isOpen={removeOpen} onOpenChange={changeRemoval}>
          <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
            <AlertDialog.Container size="sm">
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Heading>Remove email verification?</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body className="space-y-3 text-sm leading-6">
                  <p>
                    {verification.cleanupPending
                      ? "The records are cleared. Retry deleting the hosted proof without another transaction."
                      : "This clears email and verification[text][email] from your ENS name, then deletes the hosted email proof."}
                  </p>
                  <p className="text-muted">
                    Copies downloaded by others, blockchain history, and the received message
                    retained by Resend cannot be erased by this action.
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
                  <Button variant="danger" isDisabled={busy} onPress={confirmRemoval}>
                    {busy ? "Removing..." : "Remove verification"}
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </article>
    </section>
  );
}
