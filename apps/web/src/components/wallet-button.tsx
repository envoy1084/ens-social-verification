import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Avatar } from "@thenamespace/uikit/avatar";
import { Button } from "@thenamespace/uikit/button";

import { useAuthenticationFeedback } from "../auth/provider";

export function WalletButton() {
  const { error, retry } = useAuthenticationFeedback();
  if (error)
    return (
      <div className="flex max-w-64 flex-col items-end gap-2">
        <Button onPress={retry}>Retry authentication</Button>
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      </div>
    );
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        authenticationStatus,
        openConnectModal,
        openAccountModal,
        openChainModal,
      }) => {
        const loading = !mounted || authenticationStatus === "loading";
        if (loading || !account || !chain)
          return (
            <Button className="min-h-11 shrink-0" isDisabled={loading} onPress={openConnectModal}>
              {loading ? "Checking session" : "Connect Wallet"}
            </Button>
          );
        if (chain.unsupported)
          return (
            <Button variant="danger" onPress={openChainModal}>
              Wrong network
            </Button>
          );
        if (authenticationStatus !== "authenticated")
          return (
            <Button className="min-h-11 shrink-0" onPress={openConnectModal}>
              Sign in
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
