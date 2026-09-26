import { Layer } from "effect";

import { GithubMiddleware } from "../../middlewares/github.js";
import { GithubOAuthRoutes } from "./oauth.js";
import { GithubProofRoutes } from "./proofs.js";

export const GithubRoutes = Layer.mergeAll(GithubOAuthRoutes, GithubProofRoutes).pipe(
  Layer.provide(GithubMiddleware.layer),
);
