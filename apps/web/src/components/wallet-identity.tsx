import { useAvatar, usePrimaryName } from "@ensforge/react";
import { Button } from "@thenamespace/uikit/button";
import { getAddress } from "viem";

import { NameAvatar } from "./name-avatar";

export function WalletIdentity({ address, onPress }: { address: string; onPress: () => void }) {
  const primaryName = usePrimaryName({ address: getAddress(address) });
  const name = primaryName.data?.name;
  const avatar = useAvatar({ name: name ?? "", enabled: Boolean(name) });
  const avatarUrl = avatar.data?.status === "resolved" ? avatar.data.uri : undefined;
  const label = name ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <Button
      className="h-11 w-44 shrink-0 gap-2 px-2.5"
      variant="tertiary"
      onPress={onPress}
      aria-label={`Open wallet account for ${label}`}
    >
      <NameAvatar name={label} seed={address.toLowerCase()} src={avatarUrl} className="size-8" />
      <span
        className="min-w-0 flex-1 truncate text-left"
        title={name ? `${name}\n${address}` : address}
      >
        {label}
      </span>
    </Button>
  );
}
