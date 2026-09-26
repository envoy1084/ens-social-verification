/** Adapt Telegram's ID-token-only response to openid-client's token envelope. */
export async function telegramTokenResponse(response: Response) {
  if (response.status !== 200) return { response, diagnostic: "not-200" };
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    // Let openid-client report malformed JSON using its normal diagnostics.
    return { response, diagnostic: "invalid-json" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { response, diagnostic: "not-object" };
  const token = body as Record<string, unknown>;
  let diagnostic = tokenFieldTypes(token);
  for (const wrapper of ["data", "result"]) {
    if (!(wrapper in token)) continue;
    const nested = token[wrapper];
    diagnostic += `;${wrapper}:${fieldType(nested)}`;
    if (nested && typeof nested === "object" && !Array.isArray(nested))
      diagnostic += `{${tokenFieldTypes(nested as Record<string, unknown>)}}`;
  }
  if (typeof token.error === "string" && token.error) {
    const knownErrors = [
      "invalid_request",
      "invalid_client",
      "invalid_grant",
      "unauthorized_client",
      "unsupported_grant_type",
      "invalid_scope",
      "server_error",
      "temporarily_unavailable",
    ];
    const providerError = knownErrors.includes(token.error) ? token.error : "unrecognized";
    // Telegram can return OAuth errors with HTTP 200. Let openid-client process
    // them as errors instead of interpreting the body as a successful token set.
    return {
      response: Response.json({ error: providerError }, { status: 400 }),
      diagnostic: `provider-error:${providerError};${diagnostic}`,
    };
  }
  if (
    "error" in token ||
    typeof token.id_token !== "string" ||
    !token.id_token ||
    (token.access_token !== undefined && token.access_token !== null && token.access_token !== "")
  )
    return { response, diagnostic: `unchanged;${diagnostic}` };

  // This is a parser sentinel, never a credential. The Telegram branch returns only
  // verified ID-token claims and never persists tokens or calls a protected resource.
  // All JWT/nonce checks still run in authorizationCodeGrant and its JWKS validator.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");
  const adapted = new Response(
    JSON.stringify({
      ...token,
      access_token: "telegram-id-token-only",
      token_type:
        token.token_type === undefined || token.token_type === null || token.token_type === ""
          ? "Bearer"
          : token.token_type,
    }),
    { status: response.status, headers },
  );
  return { response: adapted, diagnostic: `adapted;${diagnostic}` };
}

function tokenFieldTypes(token: Record<string, unknown>) {
  return ["access_token", "id_token", "token_type", "error"]
    .map((field) => `${field}:${fieldType(token[field])}`)
    .join(",");
}

function fieldType(value: unknown) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (value === "") return "empty";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
