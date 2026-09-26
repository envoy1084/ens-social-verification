import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";

import {
  OAuthAttemptResponse,
  OAuthConfiguration,
  OAuthPublication,
  OAuthPublishRequest,
  OAuthRemovalRequest,
  OAuthRemovalResponse,
  OAuthStartRequest,
  OAuthStartResponse,
  OAuthStatusResponse,
} from "@ens-social-verification/protocol/dto";
import {
  OAuthAttemptId,
  OAuthEnvelope,
  OAuthName,
  OAuthProviderId,
} from "@ens-social-verification/protocol/schema";

import { AuthErrors } from "../auth/errors.js";

export const OAuthApi = HttpApiGroup.make("oauth").add(
  HttpApiEndpoint.get("configuration", "/verification/oauth/:provider/configuration", {
    params: { provider: OAuthProviderId },
    success: OAuthConfiguration,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("start", "/verification/oauth/:provider/start", {
    params: { provider: OAuthProviderId },
    payload: OAuthStartRequest,
    success: OAuthStartResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("callback", "/verification/oauth/:provider/callback", {
    params: { provider: OAuthProviderId },
    query: {
      state: Schema.optionalKey(Schema.String),
      code: Schema.optionalKey(Schema.String),
      error: Schema.optionalKey(Schema.String),
    },
    success: Schema.Void.pipe(HttpApiSchema.status(302)),
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Authorization-code callback with S256 PKCE, single-use state, and initiating wallet session. Redirects without exposing tokens.",
  ),
  HttpApiEndpoint.get("attempt", "/verification/oauth/attempts/:id", {
    params: { id: OAuthAttemptId },
    success: OAuthAttemptResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("publish", "/verification/oauth/attempts/:id/publish", {
    params: { id: OAuthAttemptId },
    payload: OAuthPublishRequest,
    success: OAuthPublication,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("proof", "/verification/oauth/proofs/:id", {
    params: { id: OAuthAttemptId },
    success: OAuthEnvelope,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("status", "/verification/oauth/:provider/status", {
    params: { provider: OAuthProviderId },
    query: { name: OAuthName },
    success: OAuthStatusResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Checks trusted-attestor and owner signatures, current ENSv2 authority and records, expiry, and revocation. Trusts the configured attestor's account observation.",
  ),
  HttpApiEndpoint.post("removal", "/verification/oauth/:provider/removal", {
    params: { provider: OAuthProviderId },
    payload: OAuthRemovalRequest,
    success: OAuthRemovalResponse,
    error: AuthErrors,
  }),
);
