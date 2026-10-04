import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";

import {
  AuthMessageRequest,
  AuthMessageResponse,
  AuthNonceResponse,
  AuthSession,
  AuthVerifyRequest,
} from "@ens-social-verification/protocol/dto";

import { AuthErrors } from "./errors.js";

export const AuthWalletApi = HttpApiGroup.make("authWallet").add(
  HttpApiEndpoint.post("nonce", "/auth/nonce", {
    error: AuthErrors,
    success: AuthNonceResponse,
  }).annotate(
    OpenApi.Description,
    "Creates a five-minute challenge and sets its HttpOnly browser-binding cookie. Requires APP_ORIGIN in the Origin header.",
  ),
  HttpApiEndpoint.post("message", "/auth/message", {
    error: AuthErrors,
    payload: AuthMessageRequest,
    success: AuthMessageResponse,
  }).annotate(
    OpenApi.Description,
    "Creates the exact SIWE message to sign. Requires the challenge cookie, nonce, and trusted Origin. Sepolia only.",
  ),
  HttpApiEndpoint.post("verify", "/auth/verify", {
    error: AuthErrors,
    payload: AuthVerifyRequest,
    success: AuthSession,
  }).annotate(
    OpenApi.Description,
    "Verifies the exact SIWE message/signature, consumes the challenge, and sets an HttpOnly session cookie. Requires the challenge cookie and trusted Origin. Supports EOAs and deployed ERC-1271 wallets.",
  ),
);
