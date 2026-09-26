import * as client from "openid-client";

export function oauthExchangeFailure(error: unknown) {
  if (error instanceof client.ResponseBodyError) {
    if (error.error === "invalid_client")
      return "OAuth client credentials were rejected. Use the provider's OAuth client ID and secret, not a bot API token.";
    if (error.error === "invalid_grant")
      return "OAuth code exchange was rejected. Check the exact redirect URI and start a new login attempt.";
  }
  if (error instanceof client.ClientError) {
    if (
      error.code === "OAUTH_INVALID_RESPONSE" &&
      error.cause instanceof Error &&
      error.cause.message === 'JWT "nonce" (nonce) claim missing'
    )
      return "OIDC nonce is missing or mismatched in the provider's ID token.";
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
