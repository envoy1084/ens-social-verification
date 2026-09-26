import { useCallback } from "react";

import {
  useAddress,
  useAvatar,
  useExpiry,
  useIndexedName,
  useOwner,
  useText,
} from "@ensforge/react";
import { Button } from "@thenamespace/uikit/button";
import {
  ArrowUpRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  HugeiconsIcon,
  Key01Icon,
} from "@thenamespace/uikit/icons";
import { Skeleton } from "@thenamespace/uikit/skeleton";
import NetworkEthereum from "@web3icons/react/icons/networks/NetworkEthereum";

import { formatEnsDate } from "../data/ens-name";
import { EmailVerification } from "../email/email-verification";
import { FarcasterVerification } from "../farcaster/farcaster-verification";
import { GithubVerification } from "../github/github-verification";
import { DiscordVerification } from "../oauth/discord-verification";
import { XVerification } from "../x/x-verification";
import { CopyButton } from "./copy-button";
import { NameAvatar } from "./name-avatar";
import { OwnerIdentity } from "./owner-identity";

export function NameProfile({
  name,
  githubAttempt,
  xAttempt,
  oauthAttempt,
}: {
  name: string;
  githubAttempt?: string | undefined;
  xAttempt?: string | undefined;
  oauthAttempt?: string | undefined;
}) {
  const owner = useOwner({ name });
  const expiry = useExpiry({ name });
  const avatar = useAvatar({ name });
  const address = useAddress({ name, coinType: 60n });
  const details = useIndexedName({ name });
  const description = useText({ name, key: "description" });
  const website = useText({ name, key: "url" });
  const email = useText({ name, key: "email" });
  const ownerAddress = owner.data?.owner;
  const avatarUrl = avatar.data?.status === "resolved" ? avatar.data.uri : undefined;
  let websiteUrl: URL | undefined;
  try {
    const parsed = new URL(website.data?.value ?? "");
    if (parsed.protocol === "https:" || parsed.protocol === "http:") websiteUrl = parsed;
  } catch {
    // Text records may contain a value that is not a navigable URL.
  }
  const retry = useCallback(() => {
    void Promise.allSettled([
      owner.refresh(),
      expiry.refresh(),
      avatar.refresh(),
      address.refresh(),
      details.refresh(),
      description.refresh(),
      website.refresh(),
      email.refresh(),
    ]);
  }, [owner, expiry, avatar, address, details, description, website, email]);
  const failed = [owner, expiry, avatar, address, details, description, website, email].some(
    (record) => record.isFailure,
  );

  return (
    <main className="min-h-screen bg-[#fafafa] pb-20">
      <div className="relative h-[clamp(20rem,32vw,28rem)] overflow-hidden">
        <img
          alt=""
          className={`size-full object-cover object-center transition-[filter] duration-500 ${owner.isInitial ? "grayscale" : ""}`}
          src="/header.svg"
        />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-[#fafafa]" />
      </div>
      <div className="relative mx-auto -mt-16 w-[90%] max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="inline-block min-w-0 max-w-full rounded-lg bg-accent px-4 py-2 text-3xl font-semibold break-all text-accent-foreground shadow-sm sm:text-4xl">
            {name}
          </h1>
          <div className="shrink-0">
            <CopyButton
              label="Copy profile link"
              value={`${window.location.origin}/${encodeURIComponent(name)}`}
              share
            />
          </div>
        </div>

        <dl className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
          <div className="flex min-h-10 items-center gap-2">
            <HugeiconsIcon icon={Key01Icon} size={18} className="text-muted" />
            <dt className="text-muted">Owner</dt>
            <dd className="flex items-center gap-1 font-semibold">
              {owner.isInitial ? (
                <Skeleton className="h-5 w-28" />
              ) : owner.isFailure ? (
                "Unavailable"
              ) : ownerAddress ? (
                <OwnerIdentity address={ownerAddress} />
              ) : (
                "Unowned"
              )}
            </dd>
          </div>
          <div className="flex min-h-10 items-center gap-2">
            <HugeiconsIcon icon={Calendar03Icon} size={18} className="text-muted" />
            <dt className="text-muted">Registered</dt>
            <dd className="font-semibold">
              {details.isInitial ? (
                <Skeleton className="h-5 w-28" />
              ) : details.isFailure ? (
                <span title="The Sepolia indexer could not be reached. Try again below.">
                  Lookup failed
                </span>
              ) : !details.data ? (
                "Not indexed yet"
              ) : (
                formatEnsDate(details.data.protocol === "v2" ? details.data.registeredAt : null)
              )}
            </dd>
          </div>
          <div className="flex min-h-10 items-center gap-2">
            <HugeiconsIcon icon={Clock01Icon} size={18} className="text-muted" />
            <dt className="text-muted">Expires</dt>
            <dd className="font-semibold">
              {expiry.isInitial ? (
                <Skeleton className="h-5 w-28" />
              ) : (
                formatEnsDate(expiry.data?.expiry)
              )}
            </dd>
          </div>
        </dl>

        {failed ? (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/20 bg-white p-4 text-sm"
          >
            <p>Some records couldn't be loaded.</p>
            <Button variant="secondary" size="sm" onPress={retry}>
              Try again
            </Button>
          </div>
        ) : null}

        <section
          aria-label="Profile"
          className="mt-6 grid gap-7 sm:grid-cols-[192px_minmax(0,1fr)] lg:grid-cols-[224px_minmax(0,1fr)]"
        >
          <div className="size-40 sm:size-48 lg:size-56">
            {avatar.isInitial ? (
              <Skeleton className="size-full rounded-2xl" />
            ) : (
              <NameAvatar
                name={name}
                src={avatarUrl}
                className="size-full shadow-[0_8px_30px_rgb(0_0_0/0.08)]"
              />
            )}
          </div>
          <div className="min-h-32 min-w-0 py-2 sm:min-h-48 sm:px-2 lg:min-h-56">
            <h2 className="text-lg font-semibold">About</h2>
            {description.isInitial ? (
              <div aria-label="Loading description" className="mt-5 max-w-xl space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <p className="mt-4 max-w-2xl text-base leading-7 break-words text-muted">
                {description.isFailure
                  ? "Description unavailable."
                  : description.data?.value || "No bio added yet."}
              </p>
            )}
            {website.isInitial ? (
              <Skeleton className="mt-5 h-5 w-36" />
            ) : websiteUrl ? (
              <a
                href={websiteUrl.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex max-w-full items-center gap-2 font-semibold text-accent hover:underline"
              >
                <span className="truncate">{websiteUrl.hostname}</span>
                <HugeiconsIcon icon={ArrowUpRight01Icon} size={18} className="shrink-0" />
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            ) : null}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="social-heading">
          <h2 id="social-heading" className="text-lg font-semibold">
            Social accounts
          </h2>
          <GithubVerification name={name} owner={ownerAddress} attemptId={githubAttempt} />
          <FarcasterVerification key={name} name={name} owner={ownerAddress} />
          <XVerification name={name} owner={ownerAddress} attemptId={xAttempt} />
          <DiscordVerification name={name} owner={ownerAddress} attemptId={oauthAttempt} />
        </section>
        <EmailVerification name={name} owner={ownerAddress} />
        <section className="mt-10" aria-labelledby="addresses-heading">
          <h2 id="addresses-heading" className="text-lg font-semibold">
            Addresses
          </h2>
          <article className="record-card mt-4 max-w-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <NetworkEthereum
                  size={40}
                  variant="branded"
                  aria-hidden="true"
                  className="shrink-0"
                />
                <div>
                  <h3 className="font-semibold">Ethereum</h3>
                  <p className="mt-0.5 text-xs text-muted">Main receiving address</p>
                </div>
              </div>
              {address.data?.address ? (
                <CopyButton value={address.data.address} label="Copy Ethereum address" />
              ) : null}
            </div>
            {address.isInitial ? (
              <Skeleton className="mt-5 h-5 w-5/6" />
            ) : (
              <p className="mt-5 break-all font-mono text-sm">
                {address.isFailure
                  ? "Address unavailable"
                  : address.data?.address || "No address set"}
              </p>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
