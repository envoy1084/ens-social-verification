import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiScalar, OpenApi } from "effect/unstable/httpapi";

import { Api } from "@ens-social-verification/api";

const spec = Effect.succeed(HttpServerResponse.jsonUnsafe(OpenApi.fromApi(Api)));
export const ReferenceRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/", spec),
  HttpRouter.add("GET", "/openapi.json", spec),
  HttpApiScalar.layer(Api, { path: "/reference" }),
);
