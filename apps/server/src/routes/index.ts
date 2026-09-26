import { Layer } from "effect";

import { Cors } from "../middlewares/cors.js";
import { AuthRoutes } from "./auth/index.js";
import { FarcasterRoutes } from "./farcaster/index.js";
import { GithubRoutes } from "./github/index.js";
import { HealthRoutes } from "./health.js";
import { ReferenceRoutes } from "./reference.js";
import { RpcRoutes } from "./rpc.js";
import { XRoutes } from "./x/index.js";

export const Routes = Layer.mergeAll(
  HealthRoutes,
  ReferenceRoutes,
  RpcRoutes,
  AuthRoutes,
  GithubRoutes,
  XRoutes,
  FarcasterRoutes,
  Cors,
);
