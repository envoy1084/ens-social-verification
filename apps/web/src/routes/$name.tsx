import { createFileRoute, redirect } from "@tanstack/react-router";

import { NameProfileGate } from "../components/name-profile-gate";
import { normalizeEnsInput } from "../data/ens-name";

export const Route = createFileRoute("/$name")({
  beforeLoad: ({ params }) => {
    const name = normalizeEnsInput(params.name);
    if (name !== params.name) throw redirect({ to: "/$name", params: { name }, replace: true });
  },
  component: NamePage,
});

function NamePage() {
  const { name } = Route.useParams();
  return <NameProfileGate key={name} name={name} />;
}
