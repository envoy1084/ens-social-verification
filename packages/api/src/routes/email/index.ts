import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";

import {
  EmailStartRequest,
  EmailStartResponse,
  EmailReadyResponse,
  EmailPublishRequest,
  EmailPublication,
  EmailStatusResponse,
  EmailRemovalRequest,
  EmailRemovalResponse,
  EmailPreviewResponse,
} from "@ens-social-verification/protocol/dto";
import { EmailAttemptId, EmailEnvelope, EmailName } from "@ens-social-verification/protocol/schema";

import { AuthErrors } from "../auth/errors.js";

export const EmailApi = HttpApiGroup.make("email").add(
  HttpApiEndpoint.get("preview", "/verification/email/attempts/:id/preview", {
    params: { id: EmailAttemptId },
    success: EmailPreviewResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("removeProof", "/verification/email/removal", {
    payload: EmailRemovalRequest,
    success: EmailRemovalResponse,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Removes the hosted proof after the authenticated current owner clears both ENS records. Idempotent; does not submit transactions.",
  ),
  HttpApiEndpoint.post("start", "/verification/email/start", {
    payload: EmailStartRequest,
    success: EmailStartResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("complete", "/verification/email/attempts/:id/complete", {
    params: { id: EmailAttemptId },
    success: EmailReadyResponse,
    error: AuthErrors,
  }),
  HttpApiEndpoint.post("publish", "/verification/email/attempts/:id/publish", {
    params: { id: EmailAttemptId },
    payload: EmailPublishRequest,
    success: EmailPublication,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Publishes the original DKIM email and wallet signature after explicit disclosure consent. The connected wallet, not the backend, writes ENS records.",
  ),
  HttpApiEndpoint.get("proof", "/verification/email/proofs/:id", {
    params: { id: EmailAttemptId },
    success: EmailEnvelope,
    error: AuthErrors,
  }).annotate(
    OpenApi.Description,
    "Public immutable signed proof. Publication alone is not a verified verdict.",
  ),
  HttpApiEndpoint.get("status", "/verification/email/status", {
    query: { name: EmailName },
    success: EmailStatusResponse,
    error: AuthErrors,
  }),
);
