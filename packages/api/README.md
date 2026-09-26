# API

Effect HttpApi contracts for health, authentication, and the JSON-RPC proxy.
Shared authentication schemas come from protocol. No handlers or credentials.
The server exposes the generated OpenAPI document at `/` and `/openapi.json`.
Groups live in `src/routes/`; `routes/auth/wallet.ts` and `session.ts` mirror server handlers.

`routes/github/` declares OAuth start/callback, attempt lookup, signed-gist publication
and live verification status. All endpoints appear in the generated OpenAPI document.
