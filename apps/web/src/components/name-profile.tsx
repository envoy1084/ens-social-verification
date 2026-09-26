import { useCallback } from "react";

import { useAddress, useAvatar, useExpiry, useIndexedName, useOwner } from "@ensforge/react";
import { Avatar } from "@thenamespace/uikit/avatar";
import { Button } from "@thenamespace/uikit/button";
import { Spinner } from "@thenamespace/uikit/spinner";

import { formatEnsDate } from "../data/ens-name";

export function NameProfile({ name }: { name: string }) {
  const owner = useOwner({ name });
  const expiry = useExpiry({ name });
  const avatar = useAvatar({ name });
  const resolvedAddress = useAddress({ name, coinType: 60n });
  const details = useIndexedName({ name });
  const loading = owner.isInitial;
  const address = owner.data?.owner;
  const avatarUrl = avatar.data?.status === "resolved" ? avatar.data.uri : undefined;
  const retry = useCallback(() => {
    // Each hook renders its own refreshed failure state.
    void Promise.allSettled([
      owner.refresh(),
      expiry.refresh(),
      avatar.refresh(),
      resolvedAddress.refresh(),
      details.refresh(),
    ]);
  }, [owner, expiry, avatar, resolvedAddress, details]);

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#fafafa] pb-20">
      <div className="relative h-[clamp(13rem,32vw,24rem)] overflow-hidden">
        <img alt="" className="size-full object-cover object-center" src="/header.svg" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-[#fafafa]" />
      </div>
      <section className="relative mx-auto -mt-12 w-[90%] max-w-5xl">
        <h1 className="bg-accent text-accent-foreground inline-block max-w-full rounded-sm px-4 py-2 text-2xl font-semibold break-all shadow-sm sm:text-3xl">
          {name}
        </h1>
        {loading ? (
          <output className="text-muted flex min-h-56 items-center justify-center gap-3">
            <Spinner size="md" />
            <span>Loading name details</span>
          </output>
        ) : null}
        {owner.isFailure ? (
          <div className="border-danger/20 bg-surface mt-6 rounded-lg border p-6" role="alert">
            <p className="font-semibold">Name details are unavailable.</p>
            <p className="text-muted mt-1 text-sm">
              The live ENS state could not be resolved. Try again shortly.
            </p>
            <Button className="mt-4" variant="secondary" onPress={retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {!loading && !owner.isFailure ? (
          <>
            <dl className="text-muted mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div className="flex items-baseline gap-2">
                <dt>Owner</dt>
                <dd className="text-foreground font-semibold" title={address ?? undefined}>
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Unowned"}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt>Registered</dt>
                <dd className="text-foreground font-semibold">
                  {details.isInitial
                    ? "Loading"
                    : formatEnsDate(
                        details.data?.protocol === "v1"
                          ? details.data.registration?.registeredAt
                          : details.data?.registeredAt,
                      )}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt>Expires</dt>
                <dd className="text-foreground font-semibold">
                  {expiry.isInitial ? "Loading" : formatEnsDate(expiry.data?.expiry)}
                </dd>
              </div>
            </dl>
            <article className="border-border bg-surface mt-9 flex flex-col items-center gap-6 rounded-xl border p-6 shadow-[0_12px_40px_rgb(1_26_37/0.07)] sm:flex-row sm:p-8">
              <Avatar className="size-32 shrink-0 rounded-lg sm:size-40" size="lg">
                {avatarUrl ? <Avatar.Image alt={`${name} avatar`} src={avatarUrl} /> : null}
                <Avatar.Fallback className="bg-[#e8f6fb] text-2xl font-semibold text-accent">
                  ENS
                </Avatar.Fallback>
              </Avatar>
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-muted text-xs font-bold uppercase">ENS profile</p>
                <h2 className="mt-2 text-3xl font-semibold break-all sm:text-4xl">{name}</h2>
              </div>
            </article>
            <section className="mt-12" aria-labelledby="address-heading">
              <p className="text-accent text-xs font-bold uppercase">ENS records</p>
              <h2 id="address-heading" className="mt-1 text-2xl font-semibold">
                Ethereum address
              </h2>
              <dl className="border-border mt-4 border-t py-6">
                <dt className="text-muted text-xs font-semibold uppercase">Resolved value</dt>
                <dd className="mt-2 break-all font-mono text-sm font-medium sm:text-base">
                  {resolvedAddress.isInitial
                    ? "Loading"
                    : resolvedAddress.isFailure
                      ? "Unavailable"
                      : (resolvedAddress.data?.address ?? "Not set")}
                </dd>
              </dl>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
