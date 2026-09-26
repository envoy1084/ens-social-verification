import { createHash, generateKeyPairSync, sign } from "node:crypto";

const deriveNonce = (verifier: string) =>
  createHash("sha256").update(`oauth-nonce:${verifier}`).digest("base64url");

export function telegramFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "telegram-test",
    alg: "RS256",
    use: "sig",
  };
  const token = (nonce: string, overrides: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({
        iss: "https://oauth.telegram.org",
        aud: "test-telegram",
        sub: "123456789",
        preferred_username: "Alice",
        iat: now,
        exp: now + 3600,
        nonce,
        ...overrides,
      }),
    ).toString("base64url");
    const message = `${header}.${payload}`;
    return `${message}.${sign("sha256", Buffer.from(message), privateKey).toString("base64url")}`;
  };
  return { jwk, token, nonce: deriveNonce };
}
