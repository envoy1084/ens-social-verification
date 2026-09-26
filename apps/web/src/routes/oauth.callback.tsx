import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/callback")({ component: OAuthCallback });

function OAuthCallback() {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 pt-56">
      <h1 className="text-2xl font-semibold">Your account wasn't connected</h1>
      <p className="mt-4 leading-7 text-muted">
        Authorization was cancelled, expired, or could not finish. Return to your profile and
        reconnect with the same signed-in wallet. If this continues, check the provider credentials
        and callback URL.
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
