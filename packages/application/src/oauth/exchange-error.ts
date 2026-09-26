import * as client from "openid-client";

// Match only library-authored messages; never print response bodies or claim values.
const responseFailures = new Map<string, string>([
  ['"response" body must be a top level object', "OAuth token response is not a JSON object."],
  ["Invalid JWT", "OIDC ID token is not a valid JWT."],
  ["JWT Header must be a top level object", "OIDC ID token header is malformed."],
  ["JWT Payload must be a top level object", "OIDC ID token payload is malformed."],
  ["JWT signature verification failed", "OIDC ID token signature failed verification."],
  ['unexpected JWT "typ" header parameter value', "OIDC ID token has an unsupported token type."],
]);
for (const field of ["access_token", "token_type", "id_token", "refresh_token", "scope"]) {
  for (const constraint of ["must be a string", "must not be empty"]) {
    responseFailures.set(
      `"response" body "${field}" property ${constraint}`,
      `OAuth token response field ${field} is missing, empty or has an invalid type.`,
    );
  }
}
for (const constraint of ["must be a number", "must be a non-negative number"]) {
  responseFailures.set(
    `"response" body "expires_in" property ${constraint}`,
    "OAuth token response expires_in is not a valid non-negative duration.",
  );
}
for (const [claim, label] of [
  ["iss", "issuer"],
  ["aud", "audience"],
  ["sub", "subject"],
  ["iat", "issued at"],
  ["exp", "expiration time"],
  ["nbf", "not before"],
  ["auth_time", "authentication time"],
  ["azp", "authorized party"],
]) {
  responseFailures.set(
    `JWT "${claim}" (${label}) claim missing`,
    `OIDC ID token is missing the required ${claim} claim.`,
  );
  responseFailures.set(
    `unexpected JWT "${claim}" (${label}) claim type`,
    `OIDC ID token claim ${claim} has an invalid type.`,
  );
}

const diagnosticCodes = new Set([
  "OAUTH_INVALID_RESPONSE",
  "OAUTH_RESPONSE_IS_NOT_JSON",
  "OAUTH_RESPONSE_IS_NOT_CONFORM",
  "OAUTH_PARSE_ERROR",
  "OAUTH_UNSUPPORTED_OPERATION",
  "OAUTH_KEY_SELECTION_FAILED",
  "OAUTH_TIMEOUT",
  "OAUTH_ABORT",
  "OAUTH_JWT_CLAIM_COMPARISON_FAILED",
  "OAUTH_JWT_TIMESTAMP_CHECK_FAILED",
  "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED",
  "OAUTH_RESPONSE_BODY_ERROR",
  "OAUTH_WWW_AUTHENTICATE_CHALLENGE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

export function oauthExchangeDiagnostic(error: unknown) {
  const codes = new Set<string>();
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ("code" in current && typeof current.code === "string" && diagnosticCodes.has(current.code))
      codes.add(current.code);
    if (current instanceof TypeError) codes.add("TypeError");
    current = "cause" in current ? current.cause : undefined;
  }
  return [...codes].join(", ") || "unclassified";
}

export function oauthExchangeFailure(error: unknown) {
  if (error instanceof client.ResponseBodyError) {
    if (error.error === "invalid_client")
      return "OAuth client credentials were rejected. Use the provider's OAuth client ID and secret, not a bot API token.";
    if (error.error === "invalid_grant")
      return "OAuth code exchange was rejected. Check the exact redirect URI and start a new login attempt.";
  }
  if (error instanceof client.ClientError) {
    if (error.code === "OAUTH_TIMEOUT")
      return "OAuth provider request timed out. Check outbound HTTPS connectivity from the backend.";
    if (
      error.code === "OAUTH_INVALID_RESPONSE" &&
      error.cause instanceof Error &&
      error.cause.message === 'unexpected JWT "alg" header parameter'
    )
      return "OIDC signing algorithm mismatch. Set Telegram Login Widget > Advanced to RS256.";
    if (
      error.code === "OAUTH_INVALID_RESPONSE" &&
      error.cause instanceof Error &&
      error.cause.message === 'JWT "nonce" (nonce) claim missing'
    )
      return "OIDC nonce is missing or mismatched in the provider's ID token.";
    if (error.code === "OAUTH_INVALID_RESPONSE" && error.cause instanceof Error) {
      const failure = responseFailures.get(error.cause.message);
      if (failure) return failure;
    }
    if (error.code === "OAUTH_JWT_CLAIM_COMPARISON_FAILED") {
      const cause = error.cause;
      const details = cause instanceof Error ? cause.cause : undefined;
      if (details && typeof details === "object" && "claim" in details) {
        if (details.claim === "nonce")
          return "OIDC nonce is missing or mismatched in the provider's ID token.";
        if (details.claim === "aud")
          return "OIDC token audience does not match the configured client ID.";
        if (details.claim === "iss")
          return "OIDC token issuer does not match the configured provider.";
      }
      return "OIDC token claims failed validation.";
    }
    if (error.code === "OAUTH_JWT_TIMESTAMP_CHECK_FAILED")
      return "OIDC token timestamp failed validation. Check the server clock and reconnect.";
  }
  // Provider descriptions and causes can contain tokens or private claims; never forward them.
  return "OAuth token exchange or ID-token validation failed. Check provider credentials, callback URL, signing algorithm and connectivity.";
}
