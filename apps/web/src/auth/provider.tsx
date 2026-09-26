import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { RainbowKitAuthenticationProvider } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { watchAccount } from "wagmi/actions";

import { wagmiConfig } from "../wallet";
import { createWalletAuthentication, sessionKey } from "./adapter";

const AuthenticationFeedback = createContext<{ error: string | null; retry: () => void } | null>(
  null,
);

export function useAuthenticationFeedback() {
  const feedback = useContext(AuthenticationFeedback);
  if (!feedback) throw new Error("AuthenticationProvider is required");
  return feedback;
}

export function AuthenticationProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const account = useAccount();
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [authentication] = useState(() => createWalletAuthentication(queryClient, setLogoutFailed));
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => authentication.session(signal),
    retry: false,
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

  useEffect(
    () =>
      watchAccount(wagmiConfig, {
        onChange: (next, previous) => {
          if (
            previous.status === "connected" &&
            (next.address !== previous.address ||
              next.chainId !== previous.chainId ||
              next.connector?.uid !== previous.connector?.uid)
          ) {
            void authentication.adapter.signOut();
          }
        },
      }),
    [authentication],
  );

  const expiresAt = session.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => {
        queryClient.setQueryData(sessionKey, null);
        void queryClient.invalidateQueries({ queryKey: sessionKey });
      },
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, queryClient]);

  const authenticated =
    !session.isError &&
    !logoutFailed &&
    account.isConnected &&
    session.data?.address.toLowerCase() === account.address?.toLowerCase() &&
    session.data?.chainId === account.chainId;
  const status =
    session.isPending || account.isReconnecting
      ? "loading"
      : authenticated
        ? "authenticated"
        : "unauthenticated";
  const error = logoutFailed
    ? "Sign-out failed. Retry to revoke your server session."
    : session.isError
      ? "Couldn't reach the sign-in server. Try again."
      : null;

  const { refetch } = session;
  const feedback = useMemo(
    () => ({
      error,
      retry: () => {
        if (logoutFailed) void authentication.adapter.signOut();
        else void refetch();
      },
    }),
    [error, logoutFailed, authentication, refetch],
  );

  return (
    <AuthenticationFeedback value={feedback}>
      <RainbowKitAuthenticationProvider adapter={authentication.adapter} status={status}>
        {children}
      </RainbowKitAuthenticationProvider>
    </AuthenticationFeedback>
  );
}
