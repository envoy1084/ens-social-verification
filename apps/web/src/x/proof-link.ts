import { env } from "../env";

export function xProofLink(proofUri: string) {
  return import.meta.env.DEV &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.serverUrl).hostname)
    ? new URL(new URL(proofUri).pathname, env.serverUrl).href
    : proofUri;
}
