import { useCallback } from "react";

import { Label } from "@thenamespace/uikit/label";
import { Switch } from "@thenamespace/uikit/switch";
import { useAccount } from "wagmi";

import { useHca } from "./use-hca";

export function HcaBanner({ name, owner }: { name: string; owner: string | null | undefined }) {
  const account = useAccount();
  const hca = useHca(name);
  const changeSponsorship = useCallback((selected: boolean) => hca.setWalletPaid(!selected), [hca]);
  if (
    !hca.enabled ||
    !account.address ||
    account.address.toLowerCase() !== owner?.toLowerCase() ||
    account.chainId !== 11155111
  )
    return null;
  return (
    <aside
      className="mt-5 flex justify-end border-y border-border py-3 text-sm"
      aria-label="Transaction sponsorship"
    >
      <Switch isSelected={!hca.walletPaid} onChange={changeSponsorship} size="sm">
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Sponsor updates</Label>
        </Switch.Content>
      </Switch>
    </aside>
  );
}
