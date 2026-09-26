import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: search.error === "identity" ? "identity" : "authorization",
  }),
  component: OAuthCallback,
});

function OAuthCallback() {
  const { error } = Route.useSearch();
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 pt-56">
      <h1 className="text-2xl font-semibold">Your account wasn't connected</h1>
      <p className="mt-4 leading-7 text-muted">
        {error === "identity"
          ? "Your provider did not return a supported public username. For Telegram, set a username in your account settings, then return to your ENS profile and reconnect."
          : "Authorization was cancelled, expired, or could not finish. Return to your profile and reconnect with the same signed-in wallet. If this continues, check the provider credentials and callback URL."}
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
