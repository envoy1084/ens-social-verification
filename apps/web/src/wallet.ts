import { getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

import { env } from "./env";

const transports = { [sepolia.id]: http(`${env.serverUrl}/rpc/${sepolia.id}`) };
export const wagmiConfig = env.walletConnectProjectId
  ? getDefaultConfig({
      appName: "ENS Social Verification",
      projectId: env.walletConnectProjectId,
      chains: [sepolia],
      transports,
    })
  : createConfig({ chains: [sepolia], connectors: [injected()], transports });

const theme = lightTheme({
  accentColor: "#0080bc",
  accentColorForeground: "#ffffff",
  borderRadius: "small",
  fontStack: "system",
  overlayBlur: "small",
});
export const rainbowKitTheme = {
  ...theme,
  radii: {
    ...theme.radii,
    actionButton: "4px",
    connectButton: "4px",
    menuButton: "4px",
    modal: "8px",
    modalMobile: "8px",
  },
};
