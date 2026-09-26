import { Link, Outlet, createRootRoute } from "@tanstack/react-router";

import { AppNavbar } from "../components/app-navbar";

export const Route = createRootRoute({
  component: () => (
    <>
      <AppNavbar />
      <Outlet />
    </>
  ),
  notFoundComponent: () => (
    <main className="mx-auto w-[90%] max-w-5xl py-20">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Link className="text-accent mt-4 inline-block underline" to="/">
        Back to search
      </Link>
    </main>
  ),
  errorComponent: () => (
    <main className="mx-auto w-[90%] max-w-5xl py-20" role="alert">
      <h1 className="text-3xl font-semibold">Unable to open this profile</h1>
      <Link className="text-accent mt-4 inline-block underline" to="/">
        Back to search
      </Link>
    </main>
  ),
});
