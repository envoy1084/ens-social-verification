import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Avatar } from "@thenamespace/uikit/avatar";
import { Button } from "@thenamespace/uikit/button";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        if (!mounted || !account || !chain)
          return (
            <Button className="min-h-11 shrink-0" isDisabled={!mounted} onPress={openConnectModal}>
              Connect Wallet
            </Button>
          );
        if (chain.unsupported)
          return (
            <Button variant="danger" onPress={openChainModal}>
              Wrong network
            </Button>
          );
        return (
          <Button className="min-h-11 max-w-44" variant="tertiary" onPress={openAccountModal}>
            <Avatar className="size-6 shrink-0" size="sm">
              {account.ensAvatar ? <Avatar.Image alt="" src={account.ensAvatar} /> : null}
              <Avatar.Fallback>{account.address.slice(2, 4).toUpperCase()}</Avatar.Fallback>
            </Avatar>
            <span className="truncate">{account.displayName}</span>
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}
