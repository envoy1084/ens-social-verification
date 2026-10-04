import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api";

export const HealthApi = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("live", "/health", {
    success: Schema.Struct({ status: Schema.Literal("ok") }),
  }),
  HttpApiEndpoint.get("ready", "/health/ready", {
    success: Schema.Struct({ status: Schema.Literal("ready") }),
    error: Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(503)),
  }).annotate(OpenApi.Description, "Configuration readiness; does not probe Alchemy."),
);
