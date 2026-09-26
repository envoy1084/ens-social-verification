import { useState, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { sepoliaV2Deployment, sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { EnsforgeProvider } from "@ensforge/react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";

import { AuthenticationProvider } from "./auth/provider";
import { rainbowKitTheme, wagmiConfig } from "./wallet";

const ensforgeConfig = {
  hca: sepoliaHcaDeployment,
  network: {
    id: "ens-social-verification-sepolia-v2",
    chainId: 11155111,
    protocol: "v2" as const,
    v2: sepoliaV2Deployment,
  },
  wagmiConfig,
  indexer: {
    endpoints: { v1: null, v2: "https://staging-graphql.ens.dev/graphql" },
    fetch: ((input, init) => {
      const request = new Request(input, init);
      // The public indexer permits Content-Type/Authorization, not Effect's tracing headers.
      request.headers.delete("b3");
      request.headers.delete("traceparent");
      return fetch(request);
    }) satisfies typeof fetch,
    timeout: 10_000,
    retry: { attempts: 1 },
  },
};
export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Returning from a wallet prompt must not recheck every social proof at once.
          queries: { refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <EnsforgeProvider config={ensforgeConfig}>
          <AuthenticationProvider>
            <RainbowKitProvider theme={rainbowKitTheme}>{children}</RainbowKitProvider>
          </AuthenticationProvider>
        </EnsforgeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
