import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/github/callback")({ component: GithubCallback });

function GithubCallback() {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 pt-56">
      <h1 className="text-2xl font-semibold">GitHub wasn't connected</h1>
      <p className="mt-4 leading-7 text-muted">
        Authorization was cancelled, expired, or couldn't be completed. Return to your ENS profile
        and connect GitHub again with the same signed-in wallet.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block font-semibold text-accent underline underline-offset-4"
      >
        Find your ENS name
      </Link>
    </main>
  );
}
