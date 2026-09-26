import { Schema } from "effect";

const OptionalUrl = Schema.optional(Schema.String.check(Schema.isPattern(/^https?:\/\//)));
export const env = Schema.decodeUnknownSync(
  Schema.Struct({
    walletConnectProjectId: Schema.optional(
      Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/i)),
    ),
    subgraphUrl: OptionalUrl,
  }),
)({
  ...(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
    ? { walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID }
    : {}),
  ...(import.meta.env.VITE_ENS_SUBGRAPH_URL
    ? { subgraphUrl: import.meta.env.VITE_ENS_SUBGRAPH_URL }
    : {}),
});
