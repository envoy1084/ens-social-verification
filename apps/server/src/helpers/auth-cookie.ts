export function authCookies(secure: boolean) {
  return {
    session: secure ? "__Host-ens-session" : "ens-session",
    challenge: secure ? "__Host-ens-challenge" : "ens-challenge",
    options: { httpOnly: true, secure, sameSite: "lax" as const, path: "/" },
  };
}
