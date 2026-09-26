# Container Deployment

Both Dockerfiles use the repository root as their build context. Turbo prunes the
workspace per app; dependency installation is frozen to the lockfile. `.dockerignore`
excludes local env files, Git history, private research, and host dependencies.

```sh
docker build -f apps/server/Dockerfile -t ens-social-server .
docker build -f apps/web/Dockerfile --build-arg VITE_SERVER_URL=https://api.example.com --build-arg VITE_SITE_URL=https://app.example.com -t ens-social-web .
```

The optional web build argument `VITE_WALLETCONNECT_PROJECT_ID` is public browser
configuration. Never pass Alchemy keys or database credentials as build arguments.

## Dokploy

Create two Applications from the same repository and branch using Dockerfile builds:

| Setting             | Backend                  | Frontend              |
| ------------------- | ------------------------ | --------------------- |
| Build Path          | `/`                      | `/`                   |
| Dockerfile Path     | `apps/server/Dockerfile` | `apps/web/Dockerfile` |
| Docker Context Path | `.`                      | `.`                   |
| Container port      | `8080`                   | `8080`                |

Set the context explicitly; do not use the Dockerfile's parent directory as context.
Turbo needs the root `package.json`, workspace manifest, lockfile, patches and shared
packages. A "Missing packageManager" pruning error usually means Dokploy copied an
app's package.json instead of the repository root, or deployed an outdated revision.
Both images fail early with a root-context diagnostic. Do not fix this by adding
`packageManager` to individual app manifests.

Set backend variables in the runtime Environment section and frontend `VITE_*`
values in Build Time Arguments. Local `.env.prod` files are excluded from Docker
contexts and are not automatically loaded. Use Dokploy's internal PostgreSQL URL,
not localhost. Deploy PostgreSQL first, then backend and frontend; route each HTTPS
domain to its application's container port 8080 without publishing database ports.

## Backend

The runtime is Node 24, uses the non-root `node` user, listens on 8080, and contains
only the deployed backend dependency graph. Compiled database code and committed SQL
migrations are included. Every start runs advisory-locked migrations before listening.

Supply runtime variables through your VPS secret manager or an untracked env file:
`NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`, `APP_ORIGIN` (exact HTTPS origin),
`DATABASE_URL` and `ALCHEMY_API_KEY`. Use a container-reachable database hostname, not
`localhost`, in `DATABASE_URL`. Keep Postgres private; expose the backend through
your VPS HTTPS ingress at the public API hostname.

## Frontend

The runtime is unprivileged Nginx on port 8080, serving static files only. It supplies
an SPA fallback for ENS-name routes and caches hashed assets. There is no API proxy
or dependency on a running backend container to start Nginx. `/healthz` checks Nginx;
the backend image health check calls `/health`. Neither proves upstream readiness.

`VITE_SERVER_URL` is a required public build argument, not a runtime variable. Rebuild
the image when changing it. The browser calls this URL directly for RPC and
auth requests. The auth client uses `credentials: "include"`. The backend permits
credentialed CORS only from its configured `APP_ORIGIN` (never wildcard origins).

Also set the required `VITE_SITE_URL` build argument to the HTTPS frontend origin
(for this deployment, `https://ethtokyo.envoy1084.xyz`). It sets canonical/social
URLs and the generated sitemap. Without an HTTPS origin, local builds are marked
non-indexable. Keep it aligned with `APP_ORIGIN`; rebuild when the domain changes.

Use same-site HTTPS hosts, for example frontend `https://app.example.com` and backend
`https://api.example.com`. Set `APP_ORIGIN=https://app.example.com`. Existing host-only
Secure/SameSite=Lax cookies remain on the API host; unrelated cross-site domains are
not supported. Terminate HTTPS for both hosts at VPS ingress. Restrict backend
reference/OpenAPI paths there if they should remain private. Never expose Postgres.

## Pending

VPS-specific TLS, backups, resource limits, database credentials, and ingress rate
limits must be configured before public deployment. Pin the Nginx image to a reviewed
digest for releases. The local Compose file intentionally runs only Postgres.
