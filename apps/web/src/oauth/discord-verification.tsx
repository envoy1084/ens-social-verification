import { OAuthVerification } from "./oauth-verification";

export function DiscordVerification(props: {
  name: string;
  owner?: string | null | undefined;
  attemptId?: string | undefined;
}) {
  return <OAuthVerification provider="discord" {...props} />;
}
