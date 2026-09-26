/** Adapt Telegram's ID-token-only response to openid-client's token envelope. */
export async function telegramTokenResponse(response: Response): Promise<Response> {
  if (response.status !== 200) return response;
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    // Let openid-client report malformed JSON using its normal diagnostics.
    return response;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const token = body as Record<string, unknown>;
  if (
    "error" in token ||
    typeof token.id_token !== "string" ||
    !token.id_token ||
    (token.access_token !== undefined && token.access_token !== "")
  )
    return response;

  // This is a parser sentinel, never a credential. The Telegram branch returns only
  // verified ID-token claims and never persists tokens or calls a protected resource.
  // All JWT/nonce checks still run in authorizationCodeGrant and its JWKS validator.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");
  return new Response(
    JSON.stringify({
      ...token,
      access_token: "telegram-id-token-only",
      token_type:
        token.token_type === undefined || token.token_type === "" ? "Bearer" : token.token_type,
    }),
    { status: response.status, headers },
  );
}
