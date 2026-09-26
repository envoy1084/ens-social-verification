import { useState, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EnsforgeProvider } from "@ensforge/react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";

import { env } from "./env";
import { rainbowKitTheme, wagmiConfig } from "./wallet";

const ensforgeConfig = {
  network: "sepolia" as const,
  wagmiConfig,
  indexer: {
    // Current profiles use the Sepolia v1 registry, not the v2 staging deployment.
    endpoints: { v2: null, ...(env.subgraphUrl ? { v1: env.subgraphUrl } : {}) },
    timeout: 10_000,
    retry: { attempts: 1 },
  },
};
export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <EnsforgeProvider config={ensforgeConfig}>
          <RainbowKitProvider theme={rainbowKitTheme}>{children}</RainbowKitProvider>
        </EnsforgeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
