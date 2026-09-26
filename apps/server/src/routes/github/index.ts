import { Layer } from "effect";

import { GithubMiddleware } from "../../middlewares/github.js";
import { GithubOAuthRoutes } from "./oauth.js";
import { GithubProofRoutes } from "./proofs.js";
import { GithubRemovalRoutes } from "./removal.js";

export const GithubRoutes = Layer.mergeAll(
  GithubOAuthRoutes,
  GithubProofRoutes,
  GithubRemovalRoutes,
).pipe(Layer.provide(GithubMiddleware.layer));
