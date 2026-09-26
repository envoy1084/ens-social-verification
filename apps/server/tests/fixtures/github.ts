import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";

import {
  createVerificationClient,
  GithubAuthority,
  GithubConfig,
  GithubOAuth,
  GithubProofs,
  GithubProvider,
  GithubTokens,
  VerificationClient,
  verificationDeployment,
} from "@ens-social-verification/application";
import {
  GithubAttemptRepository,
  GithubPublicationRepository,
} from "@ens-social-verification/database";
import { githubProofFilename, serializeGithubEnvelope } from "@ens-social-verification/protocol";
import { GithubError } from "@ens-social-verification/protocol/errors";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";

import { GithubRoutes } from "../../src/routes/github/index.js";
import { authFixture } from "./auth.js";

export function githubFixture(databaseUrl: string, owner: Address) {
  const auth = authFixture(databaseUrl);
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const rpc = { owner };
  const records: Record<string, string> = {};
  const abi = parseAbi([
    "function getSubregistry(string label) view returns (address)",
    "function getState(uint256 id) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function resolve(bytes name, bytes data) view returns (bytes result, address resolver)",
    "function multicall(bytes[] data) view returns (bytes[] results)",
    "function text(bytes32 node, string key) view returns (string)",
  ]);
  const client = createPublicClient({
    chain: sepolia,
    transport: custom(
      {
        request: async ({ method, params }) => {
          if (method === "eth_chainId") return "0xaa36a7";
          if (method === "eth_getBlockByNumber")
            return {
              number: "0x64",
              hash: `0x${"11".repeat(32)}`,
              timestamp: `0x${timestamp.toString(16)}`,
            };
          if (method === "eth_getCode") return "0x";
          if (method === "eth_call") {
            const [call] = params as [{ data: Hex }];
            const selector = call.data.slice(0, 10);
            if (selector === toFunctionSelector("getSubregistry(string)"))
              return encodeFunctionResult({
                abi,
                functionName: "getSubregistry",
                result: verificationDeployment.contracts.ethRegistry,
              });
            if (selector === toFunctionSelector("getState(uint256)"))
              return encodeFunctionResult({
                abi,
                functionName: "getState",
                result: {
                  status: 2,
                  expiry: timestamp + 864000n,
                  latestOwner: rpc.owner,
                  tokenId: 1n,
                  resource: 1n,
                },
              });
            if (selector === toFunctionSelector("ownerOf(uint256)"))
              return encodeFunctionResult({ abi, functionName: "ownerOf", result: rpc.owner });
            if (selector === toFunctionSelector("resolve(bytes,bytes)")) {
              const resolved = decodeFunctionData({ abi, data: call.data });
              if (resolved.functionName !== "resolve") throw new Error("Expected resolve");
              const batch = decodeFunctionData({ abi, data: resolved.args[1] });
              if (batch.functionName !== "multicall") throw new Error("Expected multicall");
              const results = batch.args[0].map((data) => {
                const text = decodeFunctionData({ abi, data });
                if (text.functionName !== "text") throw new Error("Expected text");
                return encodeFunctionResult({
                  abi,
                  functionName: "text",
                  result: records[text.args[1]] ?? "",
                });
              });
              return encodeFunctionResult({
                abi,
                functionName: "resolve",
                result: [
                  encodeFunctionResult({ abi, functionName: "multicall", result: results }),
                  owner,
                ],
              });
            }
          }
          throw new Error(`Unexpected RPC: ${method}`);
        },
      },
      { retryCount: 0 },
    ),
  });
  const sdk = createVerificationClient(client);
  const identity = { id: "123", login: "alice" };
  const gist = {
    id: "a".repeat(32),
    public: true as const,
    owner: { id: 123, login: "alice", type: "User" as const },
    files: {
      [githubProofFilename]: {
        filename: githubProofFilename,
        content: "",
        truncated: false,
        size: 0,
      },
    },
  };
  let creations = 0;
  const provider = Layer.succeed(GithubProvider, {
    exchange: () => Effect.succeed({ identity, token: Redacted.make("test-github-token") }),
    currentUser: () => Effect.succeed(identity),
    lookup: () => Effect.succeed(identity),
    createGist: (_token, envelope) =>
      Effect.sync(() => {
        creations++;
        gist.files[githubProofFilename].content = serializeGithubEnvelope(envelope);
        gist.files[githubProofFilename].size = gist.files[githubProofFilename].content.length;
        return gist;
      }),
    readGist: (id) =>
      id === gist.id
        ? Effect.succeed(gist)
        : Effect.fail(new GithubError({ code: "INVALID_PROOF", message: "Gist missing" })),
  });
  const config = Layer.succeed(GithubConfig, {
    enabled: true,
    clientId: "test",
    clientSecret: Redacted.make("secret"),
    redirectUri: "http://localhost:8080/verification/github/callback",
    tokenEncryptionKey: Redacted.make("34".repeat(32)),
  });
  const services = GithubProofs.layer.pipe(
    Layer.provideMerge(GithubOAuth.layer),
    Layer.provide(Layer.mergeAll(GithubAuthority.layer, GithubTokens.layer)),
    Layer.provide(
      Layer.mergeAll(GithubAttemptRepository.layer, GithubPublicationRepository.layer).pipe(
        Layer.provide(auth.database),
      ),
    ),
    Layer.provide(Layer.succeed(VerificationClient, sdk)),
    Layer.provide(provider),
    Layer.provide(NodeCrypto.layer),
    Layer.provideMerge(auth.auth),
    Layer.provideMerge(config),
  );
  const web = HttpRouter.toWebHandler(
    GithubRoutes.pipe(Layer.provide(services), Layer.provide(HttpServer.layerServices)),
    { disableLogger: true },
  );
  const request = (
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string; method?: "GET" | "POST" } = {},
  ) =>
    web.handler(
      new Request(`http://localhost:8080/verification/github/${path}`, {
        method: options.method ?? (options.body ? "POST" : "GET"),
        headers: {
          "content-type": "application/json",
          origin: options.origin ?? auth.origin,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }),
    );
  return { auth, ...web, request, rpc, records, identity, gist, creations: () => creations };
}
