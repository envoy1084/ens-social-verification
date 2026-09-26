import { Layer } from "effect";

import { OAuthMiddleware } from "../../middlewares/oauth.js";
import { OAuthConnectionRoutes } from "./connection.js";
import { OAuthProofRoutes } from "./proofs.js";

export const OAuthRoutes = Layer.mergeAll(OAuthConnectionRoutes, OAuthProofRoutes).pipe(
  Layer.provide(OAuthMiddleware.layer),
);
