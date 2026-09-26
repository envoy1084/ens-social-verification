import { Layer } from "effect";

import { FarcasterMiddleware } from "../../middlewares/farcaster.js";
import { FarcasterConnectionRoutes } from "./connection.js";
import { FarcasterProofRoutes } from "./proofs.js";

export const FarcasterRoutes = Layer.mergeAll(FarcasterConnectionRoutes, FarcasterProofRoutes).pipe(
  Layer.provide(FarcasterMiddleware.layer),
);
