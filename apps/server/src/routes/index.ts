import { Layer } from "effect";

import { HealthRoutes } from "./health.js";
import { ReferenceRoutes } from "./reference.js";
import { RpcRoutes } from "./rpc.js";

export const Routes = Layer.mergeAll(HealthRoutes, ReferenceRoutes, RpcRoutes);
