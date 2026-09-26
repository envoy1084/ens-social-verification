import { HttpApi, OpenApi } from "effect/unstable/httpapi";

import { AuthWalletApi, AuthSessionApi, HealthApi, RpcApi } from "./routes/index.js";

export { RpcPayload, RpcRequest } from "./routes/rpc.js";

export class Api extends HttpApi.make("ens-social")
  .add(HealthApi, RpcApi, AuthWalletApi, AuthSessionApi)
  .annotateMerge(OpenApi.annotations({ title: "ENS Social Verification API", version: "0.1.0" })) {}
