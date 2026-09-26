import { DiscordIcon, TelegramIcon } from "@thenamespace/uikit/icons";

export const oauthProviders = {
  discord: {
    id: "discord",
    label: "Discord",
    recordKey: "com.discord",
    icon: DiscordIcon,
    iconClassName: "text-[#5865f2]",
    authorizationUrl: "https://discord.com/oauth2/authorize",
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    recordKey: "org.telegram",
    icon: TelegramIcon,
    iconClassName: "text-[#0088cc]",
    authorizationUrl: "https://oauth.telegram.org/auth",
  },
} as const;

export type OAuthProviderId = keyof typeof oauthProviders;
