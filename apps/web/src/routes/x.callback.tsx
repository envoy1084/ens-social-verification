import { createFileRoute, Link } from "@tanstack/react-router";

const messages = {
  authorization:
    "Authorization was cancelled or expired, or the wallet session changed. Return to your ENS profile and connect X again with the same signed-in wallet.",
  api_access:
    "X denied API access (403). Check that the app belongs to the correct project and has API access and the required permissions. Adding credits alone may not resolve this.",
  credentials:
    "X rejected the credentials or access token (401). Check the server's OAuth client credentials and reconnect.",
  billing:
    "X reported a billing problem (402). Check the project's credit balance and spending limit, then reconnect.",
  rate_limit: "X's API rate limit was reached. Wait before starting a new connection.",
  token_exchange:
    "X could not complete the token exchange. Check the OAuth client and exact callback URL, then start a fresh connection.",
  identity:
    "X could not return a usable public account. Check that your account is public, then reconnect.",
  permissions:
    "X did not grant the required read and post permissions. Reconnect and approve those permissions.",
  upstream:
    "X could not be reached or returned an unexpected response. Please try a fresh connection shortly.",
};

export const Route = createFileRoute("/x/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    error:
      typeof search.error === "string" && Object.hasOwn(messages, search.error)
        ? (search.error as keyof typeof messages)
        : ("authorization" as const),
  }),
  component: XCallback,
});

function XCallback() {
  const { error } = Route.useSearch();
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 pt-56">
      <h1 className="text-2xl font-semibold">X wasn't connected</h1>
      <p className="mt-4 leading-7 text-muted">{messages[error]}</p>
      <Link
        to="/"
        className="mt-6 inline-block font-semibold text-accent underline underline-offset-4"
      >
        Find your ENS name
      </Link>
    </main>
  );
}
