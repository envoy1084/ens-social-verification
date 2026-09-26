import { useCallback } from "react";

import { Link } from "@tanstack/react-router";

import { useNameState } from "@ensforge/react";
import { Button } from "@thenamespace/uikit/button";
import { Skeleton } from "@thenamespace/uikit/skeleton";

import { NameProfile } from "./name-profile";

export function NameProfileGate({
  name,
  githubAttempt,
  xAttempt,
}: {
  name: string;
  githubAttempt?: string | undefined;
  xAttempt?: string | undefined;
}) {
  const state = useNameState({ name });
  const retry = useCallback(() => {
    void state.refresh();
  }, [state]);
  const supported =
    state.data?.protocol === "v2" &&
    (state.data.kind === "v2-native" || state.data.kind === "v2-migrated") &&
    state.data.status === "active" &&
    Boolean(state.data.owner);

  if (!state.isFailure && supported)
    return <NameProfile name={name} githubAttempt={githubAttempt} xAttempt={xAttempt} />;

  return (
    <main className="min-h-screen bg-[#fafafa] pb-20">
      <div className="relative h-72 overflow-hidden sm:h-80">
        <img alt="" src="/header.svg" className="size-full object-cover grayscale" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-[#fafafa]" />
      </div>
      <section aria-busy={state.isInitial} className="relative mx-auto -mt-8 w-[90%] max-w-4xl">
        <h1 className="break-all text-3xl font-semibold sm:text-4xl">{name}</h1>
        {state.isInitial ? (
          <div className="mt-8 space-y-4">
            <output className="sr-only">Checking ENSv2 registration</output>
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        ) : (
          <>
            <h2 className="mt-8 text-xl font-semibold">
              {state.isFailure ? "We couldn't check this name" : "No active ENSv2 profile"}
            </h2>
            <p className="mt-3 max-w-lg leading-7 text-muted">
              {state.isFailure
                ? "The network lookup failed. Please try again."
                : "This name isn't an active ENSv2 registration on Sepolia. ENSv1 names aren't supported here."}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-5">
              {state.isFailure ? <Button onPress={retry}>Try again</Button> : null}
              <Link
                to="/"
                className="rounded-sm font-semibold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
              >
                Search ENSv2 names
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
