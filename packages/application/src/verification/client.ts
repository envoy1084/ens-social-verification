import { Context } from "effect";

import { sepoliaV2Deployment, sepoliaHcaDeployment } from "@ensforge/contracts/deployments";
import { Ensforge } from "@ensforge/sdk";
import type { PublicClient } from "viem";

export const verificationDeployment = sepoliaV2Deployment;

export function createVerificationClient(publicClient: PublicClient) {
  return new Ensforge({
    publicClient,
    hca: sepoliaHcaDeployment,
    network: {
      id: "ens-social-verification-sepolia-v2",
      chainId: 11155111,
      protocol: "v2",
      v2: verificationDeployment,
    },
    indexer: false,
    // No offchain gateways in the initial exact-onchain authority profile.
    gateways: { allowedHosts: [] },
  });
}

export class VerificationClient extends Context.Service<VerificationClient, Ensforge>()(
  "application/VerificationClient",
) {}
