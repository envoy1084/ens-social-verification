import { useCallback, useRef, useState, type ChangeEvent } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Effect } from "effect";

import { formatVerificationDescriptor, xMethod } from "@ens-social-verification/protocol";
import { useEnsforge } from "@ensforge/react";
import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";
import { CheckmarkCircle02Icon, HugeiconsIcon } from "@thenamespace/uikit/icons";
import { getAddress } from "viem";
import { getAccount } from "wagmi/actions";

import { authClient } from "../auth/client";
import { useRecordCalls } from "../sponsorship/use-record-calls";
import { wagmiConfig } from "../wallet";
import { xClient } from "./client";
import { xProofLink } from "./proof-link";

export function RemoveXDialog({
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
  const [deletePost, setDeletePost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const sdk = useEnsforge();
  const sendCalls = useRecordCalls(name, "com.twitter");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const options = useQuery({
    queryKey: ["x", "removal", name, proofUri, address],
    queryFn: ({ signal }) => xClient.removalOptions(name, proofUri, signal),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (running.current) return;
      setOpen(next);
      if (!next && removed) {
        queryClient.setQueryData(["x", "status", name], {
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
        setDeletePost(false);
      }
    },
    [removed, queryClient, name, navigate],
  );
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const changeDeletePost = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDeletePost(event.target.checked);
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
        formatVerificationDescriptor({ authorityVersion: 2, method: xMethod, proofUri }),
      );
      const records = await sdk.records.getTexts({
        name,
        keys: ["com.twitter", "verification[text][com.twitter]"],
      });
      if (
        records.find((record) => record.key === "com.twitter")?.value !== login ||
        records.find((record) => record.key === "verification[text][com.twitter]")?.value !==
          descriptor
      )
        throw new Error("The X records changed. Refresh this profile before removing them.");
      assertAccount();
      const sent = await sendCalls.mutateAsync({
        account: getAddress(address),
        calls: [
          sdk.records.setTexts.call({
            name,
            texts: [
              { key: "com.twitter", value: "" },
              { key: "verification[text][com.twitter]", value: "" },
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
      if (deletePost && options.data?.canDeletePost) {
        const result = await xClient.deletePost(name, proofUri);
        setMessage(result.message);
      } else {
        setMessage("Both ENS records were removed. The public post was kept.");
      }
    } catch (cause) {
      setMessage(
        confirmed
          ? "Both ENS records were removed, but post cleanup could not finish. Check the post on X; no new ENS transaction is needed."
          : cause instanceof Error
            ? cause.message
            : "Removal failed. Your post was not deleted.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [removed, address, sdk, name, login, proofUri, sendCalls, deletePost, options.data]);
  const confirm = useCallback(() => {
    void remove();
  }, [remove]);

  return (
    <AlertDialog isOpen={open} onOpenChange={onOpenChange}>
      <Button
        variant="tertiary"
        size="sm"
        className="shrink-0 text-success"
        aria-label="Verified X account: remove verification"
      >
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} /> Verified
      </Button>
      <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {removed ? "Verification removed" : "Remove X verification?"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-4 text-sm leading-6">
              {!removed ? (
                <>
                  <p>
                    This clears <strong>com.twitter</strong> and{" "}
                    <strong>verification[text][com.twitter]</strong> from{" "}
                    <strong className="break-all">{name}</strong>. Your wallet will ask you to
                    approve one transaction.
                  </p>
                  {options.data?.canDeletePost ? (
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={deletePost}
                        onChange={changeDeletePost}
                        disabled={busy}
                        className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span>
                        Also permanently delete the signed post from @{login}. This cannot be
                        undone.
                      </span>
                    </label>
                  ) : (
                    <p className="text-muted">
                      {options.isPending
                        ? "Checking X access..."
                        : "X deletion access is unavailable. The post will remain on X; you can delete it manually."}
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
                href={xProofLink(proofUri)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                View signed proof<span className="sr-only"> (opens in new tab)</span>
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
