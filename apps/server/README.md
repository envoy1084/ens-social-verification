# Server

Effect v4 HTTP server. Run `pnpm --filter @ens-social/server dev`.
Set `ALCHEMY_API_KEY` in `.env`; `HOST` defaults to `127.0.0.1`, `PORT` to `8080`.

- `GET /health`: process liveness.
- `GET /` and `GET /openapi.json`: generated OpenAPI specification.
- `GET /reference`: bundled Scalar API reference.
- `GET /health/ready`: configuration readiness, not an Alchemy connectivity probe.
- `POST /rpc/:chainId`: Alchemy JSON-RPC proxy for Ethereum (1) and Sepolia (11155111).

The proxy accepts read/estimation methods, batches of up to 20, 64 KiB requests and
2 MiB responses. Transaction signing/sending belongs to the connected wallet.
Limits are per-process: 120 HTTP requests/minute and 10 concurrent requests.
Before public deployment add gateway rate limits; CORS is not access control.
Route `/rpc` to this server on the web origin. No browser Alchemy key is required.

`pnpm --filter @ens-social/server test` runs isolated proxy tests without credentials.
