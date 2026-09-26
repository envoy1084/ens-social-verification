import type { QueryClient } from "@tanstack/react-query";

import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { getAccount } from "wagmi/actions";

import { wagmiConfig } from "../wallet";
import { authClient } from "./client";

export const sessionKey = ["auth", "session"] as const;

export function createWalletAuthentication(
  client: QueryClient,
  onLogoutError: (failed: boolean) => void,
) {
  let generation = 0;
  let nonce: string | undefined;
  let prepared: { message: string; address: string; generation: number } | undefined;
  let pendingWrite: Promise<void> = Promise.resolve();
  let pendingLogout: Promise<void> | undefined;
  let logoutFailed = false;

  const signOut = () => {
    if (pendingLogout) return pendingLogout;
    generation++;
    prepared = undefined;
    nonce = undefined;
    void client.cancelQueries({ queryKey: sessionKey });
    client.setQueryData(sessionKey, null);

    // Revocation must follow any in-flight verification that could set a session cookie.
    pendingLogout = pendingWrite
      .then(() => authClient.logout())
      .then(
        () => {
          logoutFailed = false;
          onLogoutError(false);
          return undefined;
        },
        () => {
          logoutFailed = true;
          onLogoutError(true);
        },
      )
      .finally(() => {
        pendingLogout = undefined;
      });
    pendingWrite = pendingLogout;
    return pendingLogout;
  };

  return {
    session: async (signal: AbortSignal) => {
      await pendingWrite;
      return logoutFailed ? null : authClient.session(signal);
    },
    adapter: createAuthenticationAdapter<string>({
      getNonce: async () => {
        await pendingWrite;
        if (logoutFailed) throw new Error("Retry sign-out before signing in");
        nonce = (await authClient.nonce()).nonce;
        return nonce;
      },
      createMessage: async ({ address, chainId }) => {
        await pendingWrite;
        const wallet = getAccount(wagmiConfig);
        if (
          logoutFailed ||
          chainId !== 11155111 ||
          wallet.chainId !== chainId ||
          wallet.address !== address
        ) {
          throw new Error("Wallet changed during sign-in");
        }
        const currentGeneration = generation;
        // Each signing attempt consumes its prepared nonce, so retries receive a fresh challenge.
        const challenge = nonce ?? (await authClient.nonce()).nonce;
        nonce = undefined;
        const { message } = await authClient.message({ address, chainId, nonce: challenge });
        prepared = { message, address, generation: currentGeneration };
        return message;
      },
      verify: async ({ message, signature }) => {
        const attempt = prepared;
        const wallet = getAccount(wagmiConfig);
        if (
          !attempt ||
          attempt.message !== message ||
          attempt.generation !== generation ||
          wallet.address !== attempt.address ||
          wallet.chainId !== 11155111
        )
          return false;
        await client.cancelQueries({ queryKey: sessionKey });
        const verification = pendingWrite.then(async () => {
          if (attempt.generation !== generation) return false;
          await authClient.verify(message, signature);
          const session = await authClient.session();
          const current = getAccount(wagmiConfig);
          if (
            attempt.generation !== generation ||
            current.address !== attempt.address ||
            current.chainId !== 11155111 ||
            !session ||
            session.address.toLowerCase() !== attempt.address.toLowerCase()
          )
            return false;
          client.setQueryData(sessionKey, session);
          return true;
        });
        pendingWrite = verification.then(
          () => undefined,
          () => undefined,
        );
        return verification;
      },
      signOut,
    }),
  };
}
