import { Link } from "@tanstack/react-router";

import { Navbar } from "@thenamespace/uikit/navbar";

import { WalletButton } from "./wallet-button";

export function AppNavbar() {
  return (
    <Navbar
      className="border-border bg-surface border-b shadow-[0_1px_4px_rgb(0_0_0/0.06)]"
      maxWidth="full"
      position="static"
    >
      <Navbar.Header className="mx-auto w-[90%] gap-3 px-0">
        <Navbar.Brand className="min-w-0">
          <Link
            className="flex min-w-0 items-center gap-2.5 text-sm font-semibold sm:text-lg"
            to="/"
          >
            <img alt="ENS" className="h-6 w-auto shrink-0" src="/ens-logo.svg" />
            <span>Social Verification</span>
          </Link>
        </Navbar.Brand>
        <Navbar.Spacer />
        <WalletButton />
      </Navbar.Header>
    </Navbar>
  );
}
