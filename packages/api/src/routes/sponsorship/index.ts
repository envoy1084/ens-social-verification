import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { SponsorshipRpcRequest } from "@ens-social-verification/protocol/schema";

const rejection = Schema.Struct({
  error: Schema.Struct({ message: Schema.String, notSubmitted: Schema.Boolean }),
});

export const SponsorshipApi = HttpApiGroup.make("sponsorship").add(
  HttpApiEndpoint.get("configuration", "/sponsorship/configuration", {
    success: Schema.Struct({ enabled: Schema.Boolean }),
  }),
  HttpApiEndpoint.post("rpc", "/sponsorship/:name/rpc", {
    params: { name: Schema.String },
    payload: SponsorshipRpcRequest,
    success: Schema.Unknown,
    error: [400, 401, 403, 429, 502, 503].map((status) =>
      rejection.pipe(HttpApiSchema.status(status)),
    ),
  }),
);
