import { Layer } from "effect";

import { EmailMiddleware } from "../../middlewares/email.js";
import { EmailConnectionRoutes } from "./connection.js";
import { EmailProofRoutes } from "./proofs.js";

export const EmailRoutes = Layer.mergeAll(EmailConnectionRoutes, EmailProofRoutes).pipe(
  Layer.provide(EmailMiddleware.layer),
);
