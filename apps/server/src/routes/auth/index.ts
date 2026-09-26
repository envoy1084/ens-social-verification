import { Layer } from "effect";

import { AuthMiddleware } from "../../middlewares/auth.js";
import { AuthSessionRoutes } from "./session.js";
import { AuthWalletRoutes } from "./wallet.js";

export const AuthRoutes = Layer.mergeAll(AuthWalletRoutes, AuthSessionRoutes).pipe(
  Layer.provide(AuthMiddleware.layer),
);
