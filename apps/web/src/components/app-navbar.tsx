import { Link, useRouterState } from "@tanstack/react-router";

import { EnsNameSearch } from "./ens-name-search";
import { WalletButton } from "./wallet-button";

export function AppNavbar() {
  const namePage = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/$name"),
  });
  if (!namePage) return null;
  return (
    <nav
      aria-label="Main navigation"
      className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-start justify-between gap-3 p-3 sm:p-5"
    >
      <div className="flex w-full min-w-0 items-center gap-4 rounded-2xl bg-white/95 p-3 shadow-sm sm:w-auto sm:max-w-[calc(100%-180px)]">
        <Link
          aria-label="ENS Social Verification home"
          className="flex h-12 shrink-0 flex-col items-center justify-center gap-1 rounded-sm px-1"
          to="/"
        >
          <img alt="ENS" className="h-6 w-20 object-contain" src="/ens-wordmark.svg" />
          <span className="block text-[10px] leading-3 font-semibold text-midnight">
            Social Verification
          </span>
        </Link>
        <div className="min-w-0 flex-1 sm:w-80 lg:w-96">
          <EnsNameSearch compact />
        </div>
      </div>
      <div className="ml-auto rounded-2xl bg-white/95 p-2 shadow-sm sm:p-3 [&_.button]:!rounded-xl">
        <WalletButton />
      </div>
    </nav>
  );
}
