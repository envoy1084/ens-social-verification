import { useCallback, useRef, useState, type ChangeEvent } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Effect } from "effect";

import { formatVerificationDescriptor, githubMethod } from "@ens-social-verification/protocol";
import { useEnsforge } from "@ensforge/react";
import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { CheckmarkCircle02Icon, HugeiconsIcon } from "@thenamespace/uikit/icons";
import { getAddress } from "viem";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { useRecordCalls } from "../sponsorship/use-record-calls";
import { wagmiConfig } from "../wallet";
import { githubClient } from "./client";

export function RemoveGithubDialog({
  name,
  login,
  proofUri,
  address,
}: {
  name: string;
  login: string;
  proofUri: string;
  address: string;
}) {
  const [open, setOpen] = useState(false);
  const [deleteGist, setDeleteGist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const sdk = useEnsforge();
  const sendCalls = useRecordCalls(name);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const options = useQuery({
    queryKey: ["github", "removal", name, proofUri, address],
    queryFn: ({ signal }) => githubClient.removalOptions(name, proofUri, signal),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (running.current) return;
      setOpen(next);
      if (!next && removed) {
        queryClient.setQueryData(["github", "status", name], {
          status: "unverified",
          login: null,
          reason: "Verification removed",
          proofUri: null,
          validUntil: null,
        });
        void navigate({ to: "/$name", params: { name }, search: {}, replace: true });
      }
      if (next) {
        setMessage(null);
        setDeleteGist(false);
      }
    },
    [removed, queryClient, name, navigate],
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const changeDeleteGist = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDeleteGist(event.target.checked);
  }, []);
  const remove = useCallback(async () => {
    if (running.current || removed) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    let confirmed = false;
    const assertAccount = () => {
      const current = getAccount(wagmiConfig);
      if (current.address?.toLowerCase() !== address.toLowerCase() || current.chainId !== 11155111)
        throw new Error("Return to the name owner's wallet on Sepolia.");
    };
    try {
      assertAccount();
      const session = await authClient.session();
      if (session?.address.toLowerCase() !== address.toLowerCase())
        throw new Error("Sign in with the name owner's wallet first.");
      const descriptor = await Effect.runPromise(
        formatVerificationDescriptor({ authorityVersion: 2, method: githubMethod, proofUri }),
      );
      const records = await sdk.records.getTexts({
        name,
        keys: ["com.github", "verification[text][com.github]"],
      });
      if (
        records.find((record) => record.key === "com.github")?.value !== login ||
        records.find((record) => record.key === "verification[text][com.github]")?.value !==
          descriptor
      )
        throw new Error("The GitHub records changed. Refresh this profile before removing them.");
      assertAccount();
      const sent = await sendCalls.mutateAsync({
        account: getAddress(address),
        calls: [
          sdk.records.setTexts.call({
            name,
            texts: [
              { key: "com.github", value: "" },
              { key: "verification[text][com.github]", value: "" },
            ],
          }),
        ],
        mode: "auto",
        atomicity: "preferred",
        simulation: "required",
        confirmation: { type: "confirmed", confirmations: 1, timeout: 120_000 },
      });
      if (sent.mode === "sequential" ? sent.status !== "completed" : sent.status !== "confirmed")
        throw new Error("Removal is not confirmed yet. Check the transaction before trying again.");
      confirmed = true;
      setRemoved(true);
      assertAccount();
      if (deleteGist && options.data?.canDeleteGist) {
        const result = await githubClient.deleteGist(name, proofUri);
        setMessage(result.message);
      } else {
        setMessage("Both ENS records were removed. The public gist was kept.");
      }
    } catch (cause) {
      setMessage(
        confirmed
          ? "Both ENS records were removed, but gist cleanup could not finish. Check the gist on GitHub; no new ENS transaction is needed."
          : cause instanceof Error
            ? cause.message
            : "Removal failed. Your gist was not deleted.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [removed, address, sdk, name, login, proofUri, sendCalls, deleteGist, options.data]);
  const confirm = useCallback(() => {
    void remove();
  }, [remove]);

  return (
    <AlertDialog isOpen={open} onOpenChange={onOpenChange}>
      <Button
        variant="tertiary"
        size="sm"
        className="shrink-0 text-success"
        aria-label="Verified GitHub account: remove verification"
      >
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} /> Verified
      </Button>
      <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {removed ? "Verification removed" : "Remove GitHub verification?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-4 text-sm leading-6">
              {!removed ? (
                <>
                  <p>
                    This clears <strong>com.github</strong> and{" "}
                    <strong>verification[text][com.github]</strong> from{" "}
                    <strong className="break-all">{name}</strong>. Your wallet will ask you to
                    approve one transaction.
                  </p>
                  {options.data?.canDeleteGist ? (
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={deleteGist}
                        onChange={changeDeleteGist}
                        disabled={busy}
                        className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span>
                        Also permanently delete the signed gist from @{login}. This cannot be
                        undone.
                      </span>
                    </label>
                  ) : (
                    <p className="text-muted">
                      {options.isPending
                        ? "Checking GitHub access..."
                        : "GitHub deletion access is unavailable. The gist will remain on GitHub; you can delete it manually."}
                    </p>
                  )}
                </>
              ) : null}
              {message ? (
                <p
                  role={removed ? "status" : "alert"}
                  className={removed ? "text-muted" : "text-danger"}
                >
                  {message}
                </p>
              ) : null}
              <a
                href={proofUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                View signed gist<span className="sr-only"> (opens in new tab)</span>
              </a>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={close} isDisabled={busy}>
                {removed ? "Done" : "Cancel"}
              </Button>
              {!removed ? (
                <Button variant="danger" onPress={confirm} isDisabled={busy || options.isPending}>
                  {busy ? "Removing..." : "Remove verification"}
                </Button>
              ) : null}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
