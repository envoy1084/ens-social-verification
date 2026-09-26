import { usePrimaryName } from "@ensforge/react";

import { CopyButton } from "./copy-button";

export function OwnerIdentity({ address }: { address: `0x${string}` }) {
  const primaryName = usePrimaryName({ address });
  return (
    <>
      <span className="max-w-52 truncate" title={address}>
        {primaryName.data?.name ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
      </span>
      <CopyButton value={address} label={`Copy owner address: ${address}`} />
    </>
  );
}
