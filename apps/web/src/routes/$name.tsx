import { createFileRoute, redirect } from "@tanstack/react-router";

import { NameProfileGate } from "../components/name-profile-gate";
import { normalizeEnsInput } from "../data/ens-name";

export const Route = createFileRoute("/$name")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    githubAttempt?: string | undefined;
    xAttempt?: string | undefined;
    oauthAttempt?: string | undefined;
    oauthProvider?: "discord" | "telegram" | undefined;
  } => ({
    oauthProvider:
      search.oauthProvider === "discord" || search.oauthProvider === "telegram"
        ? search.oauthProvider
        : undefined,
    oauthAttempt:
      typeof search.oauthAttempt === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        search.oauthAttempt,
      )
        ? search.oauthAttempt
        : undefined,
    xAttempt:
      typeof search.xAttempt === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(search.xAttempt)
        ? search.xAttempt
        : undefined,
    githubAttempt:
      typeof search.githubAttempt === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        search.githubAttempt,
      )
        ? search.githubAttempt
        : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    const name = normalizeEnsInput(params.name);
    if (search.oauthAttempt && !search.oauthProvider)
      throw redirect({
        to: "/$name",
        params: { name },
        search: { ...search, oauthAttempt: undefined, oauthProvider: undefined },
        replace: true,
      });
    if (name !== params.name) throw redirect({ to: "/$name", params: { name }, replace: true });
  },
  component: NamePage,
});

function NamePage() {
  const { name } = Route.useParams();
  const { githubAttempt, xAttempt, oauthAttempt } = Route.useSearch();
  return (
    <NameProfileGate
      key={name}
      name={name}
      githubAttempt={githubAttempt}
      xAttempt={xAttempt}
      oauthAttempt={oauthAttempt}
    />
  );
}
