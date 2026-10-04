import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api";

import { AuthSession } from "@ens-social-verification/protocol/dto";

import { AuthErrors } from "./errors.js";

export const AuthSessionApi = HttpApiGroup.make("authSession").add(
  HttpApiEndpoint.get("session", "/auth/session", {
    error: AuthErrors,
    success: AuthSession,
  }).annotate(
    OpenApi.Description,
    "Returns the current wallet session from its HttpOnly cookie; 401 when absent, revoked, or expired.",
  ),
  HttpApiEndpoint.post("logout", "/auth/logout", {
    error: AuthErrors,
    success: HttpApiSchema.NoContent,
  }).annotate(
    OpenApi.Description,
    "Revokes the current session and clears both cookies. Idempotent; requires the trusted Origin header.",
  ),
);
