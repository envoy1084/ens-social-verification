import { Layer } from "effect";

import { XMiddleware } from "../../middlewares/x.js";
import { XOAuthRoutes } from "./oauth.js";
import { XProofRoutes } from "./proofs.js";
import { XRemovalRoutes } from "./removal.js";

export const XRoutes = Layer.mergeAll(XOAuthRoutes, XProofRoutes, XRemovalRoutes).pipe(
  Layer.provide(XMiddleware.layer),
);
