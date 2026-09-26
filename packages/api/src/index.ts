import { HttpApi, OpenApi } from "effect/unstable/httpapi";

import { HealthApi } from "./health.js";
import { RpcApi } from "./rpc.js";

export { RpcPayload, RpcRequest } from "./rpc.js";

export class Api extends HttpApi.make("ens-social")
  .add(HealthApi, RpcApi)
  .annotateMerge(OpenApi.annotations({ title: "ENS Social Verification API", version: "0.1.0" })) {}
