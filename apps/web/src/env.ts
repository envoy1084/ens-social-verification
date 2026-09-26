import { Schema } from "effect";

export const env = Schema.decodeUnknownSync(
  Schema.Struct({
    serverUrl: Schema.String.check(
      Schema.makeFilter<string>((value) => {
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && url.origin === value;
        } catch {
          return false;
        }
      }),
    ),
    walletConnectProjectId: Schema.optional(
      Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/i)),
    ),
  }),
)({
  serverUrl: import.meta.env.VITE_SERVER_URL,
  ...(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    ? { walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID }
    : {}),
});
