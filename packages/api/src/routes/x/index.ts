import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api";

import {
  XAttemptResponse,
  XConfiguration,
  XFinalizeRequest,
  XPublishResponse,
  XStartRequest,
  XStartResponse,
  XStatusResponse,
  XRemovalRequest,
  XRemovalOptions,
  XRemovalResponse,
} from "@ens-social-verification/protocol/dto";
import { XAttemptId, XName, XEnvelope } from "@ens-social-verification/protocol/schema";

import { AuthErrors } from "../auth/errors.js";

export const XApi = HttpApiGroup.make("x").add(
  HttpApiEndpoint.get("proof", "/verification/x/proofs/:id", {
    params: { id: XAttemptId },
    success: XEnvelope,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("removalOptions", "/verification/x/removal/options", {
    payload: XRemovalRequest,
    success: XRemovalOptions,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("deletePost", "/verification/x/removal/post", {
    payload: XRemovalRequest,
    success: XRemovalResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Deletes this app's proof post using the initiating session's unexpired OAuth token, only after both ENS records are empty. Never uses the server API token.",
  ),
  HttpApiEndpoint.get("configuration", "/verification/x/configuration", {
    success: XConfiguration,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("start", "/verification/x/start", {
    payload: XStartRequest,
    success: XStartResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("callback", "/verification/x/callback", {
    query: {
      state: Schema.optionalKey(Schema.String),
      code: Schema.optionalKey(Schema.String),
      error: Schema.optionalKey(Schema.String),
    },
    success: Schema.Void.pipe(HttpApiSchema.status(302)),
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "X OAuth callback. Requires the initiating wallet session and PKCE cookie; redirects to the frontend without exposing OAuth credentials.",
  ),
  HttpApiEndpoint.get("attempt", "/verification/x/attempts/:id", {
    params: { id: XAttemptId },
    success: XAttemptResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.get("publication", "/verification/x/attempts/:id/publication", {
    params: { id: XAttemptId },
    success: Schema.NullOr(XPublishResponse),
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("publish", "/verification/x/attempts/:id/publish", {
    params: { id: XAttemptId },
    payload: XFinalizeRequest,
    success: XPublishResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Validates the owner signature and creates one public post. Does not submit an ENS transaction.",
  ),
  HttpApiEndpoint.get("status", "/verification/x/status", {
    query: { name: XName },
    success: XStatusResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Checks live ENSv2 authority, records, the signed post, and X identity. A stored publication alone is never verification.",
  ),
);
