import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";

import {
  FarcasterStartRequest,
  FarcasterStartResponse,
  FarcasterCompleteRequest,
  FarcasterReadyResponse,
  FarcasterPublishRequest,
  FarcasterPublication,
  FarcasterStatusResponse,
  FarcasterRemovalRequest,
  FarcasterRemovalResponse,
} from "@ens-social-verification/protocol/dto";
import {
  FarcasterAttemptId,
  FarcasterEnvelope,
  FarcasterName,
} from "@ens-social-verification/protocol/schema";

import { AuthErrors } from "../auth/errors.js";

export const FarcasterApi = HttpApiGroup.make("farcaster").add(
  HttpApiEndpoint.post("removeProof", "/verification/farcaster/removal", {
    payload: FarcasterRemovalRequest,
    success: FarcasterRemovalResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Removes the hosted proof after the authenticated current owner clears both ENS records. Idempotent; does not submit transactions.",
  ),
  HttpApiEndpoint.post("start", "/verification/farcaster/start", {
    payload: FarcasterStartRequest,
    success: FarcasterStartResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("complete", "/verification/farcaster/attempts/:id/complete", {
    params: { id: FarcasterAttemptId },
    payload: FarcasterCompleteRequest,
    success: FarcasterReadyResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("publish", "/verification/farcaster/attempts/:id/publish", {
    params: { id: FarcasterAttemptId },
    payload: FarcasterPublishRequest,
    success: FarcasterPublication,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Publishes both user signatures. The connected wallet, not the backend, writes ENS records.",
  ),
  HttpApiEndpoint.get("proof", "/verification/farcaster/proofs/:id", {
    params: { id: FarcasterAttemptId },
    success: FarcasterEnvelope,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Public immutable signed proof. Publication alone is not a verified verdict.",
  ),
  HttpApiEndpoint.get("status", "/verification/farcaster/status", {
    query: { name: FarcasterName },
    success: FarcasterStatusResponse,
    error: AuthErrors,
  }),
);
