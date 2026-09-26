import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";

import {
  GithubAttemptResponse,
  GithubConfiguration,
  GithubFinalizeRequest,
  GithubPublishResponse,
  GithubStartRequest,
  GithubStartResponse,
  GithubStatusResponse,
  GithubRemovalRequest,
  GithubRemovalOptions,
  GithubRemovalResponse,
} from "@ens-social-verification/protocol/dto";
import { GithubAttemptId, GithubName } from "@ens-social-verification/protocol/schema";

import { AuthErrors } from "../auth/errors.js";

export const GithubApi = HttpApiGroup.make("github").add(
  HttpApiEndpoint.post("removalOptions", "/verification/github/removal/options", {
    payload: GithubRemovalRequest,
    success: GithubRemovalOptions,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("deleteGist", "/verification/github/removal/gist", {
    payload: GithubRemovalRequest,
    success: GithubRemovalResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Deletes this app's proof gist using the initiating session's unexpired OAuth token, only after both ENS records are empty. Never uses the server API token.",
  ),
  HttpApiEndpoint.get("configuration", "/verification/github/configuration", {
    success: GithubConfiguration,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("start", "/verification/github/start", {
    payload: GithubStartRequest,
    success: GithubStartResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("callback", "/verification/github/callback", {
    query: {
      state: Schema.optionalKey(Schema.String),
      code: Schema.optionalKey(Schema.String),
      error: Schema.optionalKey(Schema.String),
    },
    success: Schema.Void.pipe(HttpApiSchema.status(302)),
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "GitHub OAuth callback. Requires the initiating wallet session and PKCE cookie; redirects to the frontend without exposing OAuth credentials.",
  ),
  HttpApiEndpoint.get("attempt", "/verification/github/attempts/:id", {
    params: { id: GithubAttemptId },
    success: GithubAttemptResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("publication", "/verification/github/attempts/:id/publication", {
    params: { id: GithubAttemptId },
    success: Schema.NullOr(GithubPublishResponse),
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("publish", "/verification/github/attempts/:id/publish", {
    params: { id: GithubAttemptId },
    payload: GithubFinalizeRequest,
    success: GithubPublishResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Validates the owner signature and creates one public gist. Does not submit an ENS transaction.",
  ),
  HttpApiEndpoint.get("status", "/verification/github/status", {
    query: { name: GithubName },
    success: GithubStatusResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Checks live ENSv2 authority, records, the signed gist, and GitHub identity. A stored publication alone is never verification.",
  ),
);
