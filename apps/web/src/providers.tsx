import { useState, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EnsforgeProvider } from "@ensforge/react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";

import { rainbowKitTheme, wagmiConfig } from "./wallet";

const ensforgeConfig = {
  network: "sepolia" as const,
  wagmiConfig,
  indexer: {
    endpoints: { v1: null },
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
