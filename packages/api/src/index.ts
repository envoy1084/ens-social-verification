import { HttpApi, OpenApi } from "effect/http-api";

import { EmailApi } from "./routes/email/index.js";
import { FarcasterApi } from "./routes/farcaster/index.js";
import { GithubApi } from "./routes/github/index.js";
import { AuthWalletApi, AuthSessionApi, HealthApi, RpcApi } from "./routes/index.js";
import { SponsorshipApi } from "./routes/sponsorship/index.js";
import { XApi } from "./routes/x/index.js";

export { RpcPayload, RpcRequest } from "./routes/rpc.js";

export class Api extends HttpApi.make("ens-social")
  .add(
    HealthApi,
    RpcApi,
    AuthWalletApi,
    AuthSessionApi,
    GithubApi,
    FarcasterApi,
    XApi,
    EmailApi,
    OAuthApi,
    SponsorshipApi,
  )
  .annotateMerge(OpenApi.annotations({ title: "ENS Social Verification API", version: "0.1.0" })) {}
import { OAuthApi } from "./routes/oauth/index.js";
