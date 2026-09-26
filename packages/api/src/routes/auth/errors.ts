import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const AuthErrors = [
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(403)),
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(413)),
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(415)),
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(429)),
  Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(503)),
];
