import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@thenamespace/uikit/button";

import { useAuthenticationFeedback } from "../auth/provider";
import { WalletIdentity } from "./wallet-identity";

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
          <WalletIdentity
            key={account.address}
            address={account.address}
            onPress={openAccountModal}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}
