# Submission: Suit Tracker Insights

## Summary

- **Backend:** dockerised. Multi-arch (amd64/arm64), distroless, runs as
  non-root, needs no internet at startup and shuts down cleanly on SIGTERM.
- **Frontend:** design for hosting it is below. I've also built it as an nginx
  image with a `docker-compose.yml`, so the whole stack runs with one command.
- **CI/CD:** GitHub Actions pipeline that checks, tests, builds and pushes both
  images to GHCR, then does stub deploys to staging and production (with an
  approval step before prod). It's green on `main`.
- **State of the code:** it needed more work than expected. `/_health` returned
  `200` but every real endpoint returned `500`, the compiled binary wouldn't
  start, and typecheck, lint, format and frozen installs all failed. I fixed
  what was blocking deployment and listed the rest at the end.

```sh
docker compose up --build
open http://localhost:8080                 # the app
curl -i http://localhost:8080/api/_ready   # backend + DB, via the proxy
```

## Changes

One change per commit:

| Commit                           | Why                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Fix CSS module typecheck errors  | `deno check` can't see Vite CSS modules (TS1192/TS2300)                                       |
| Fix client type errors           | `app.tsx` put an unresolved promise in state; test data missing `id`                          |
| Fix server startup and lifecycle | Table never created, `/insights` returned `200` as its body; added `/_ready`, errors, SIGTERM |
| Fix lint errors                  | `jsx-key`, `jsx-boolean-value`, `no-slow-types`                                               |
| Regenerate `deno.lock`           | Old lockfile format; `deno install --frozen` failed on Deno 2.4.2                             |
| Grant permissions to the binary  | Compiled binary died at startup (`NotCapable: Requires env access`)                           |
| Configurable listen address      | Oak binds `127.0.0.1` by default, so nothing outside the container can reach it               |
| Server Dockerfile                | Deliverable 1                                                                                 |
| nginx image + compose            | Deliverable 2                                                                                 |
| Fix `deno fmt --check`           | So CI can enforce formatting (template docs excluded)                                         |
| CI/CD workflow                   | Deliverable 3                                                                                 |

## 1. Backend container

[`Dockerfile`](Dockerfile) has two stages:

- **Build:** `denoland/deno:2.4.2`, `deno install --frozen`, `deno task build`.
  It cross-compiles with `--target`, so the arm64 build doesn't need QEMU.
- **Runtime:** `gcr.io/distroless/cc-debian12:nonroot`. Just glibc and libgcc,
  no shell or package manager.

Other points:

- Runs as UID 65532. Tested with a read-only root filesystem, all capabilities
  dropped and `no-new-privileges`.
- Data goes in a `/data` volume (`DB_PATH=/data/db.sqlite3`) so it survives
  restarts.
- Exec-form `ENTRYPOINT`, so the server is PID 1 and gets SIGTERM directly.
  `docker stop` takes about 300 ms and exits 0, after draining requests and
  closing the DB.

| Env var            | Default                        | Purpose             |
| ------------------ | ------------------------------ | ------------------- |
| `SERVER_HOST`      | `0.0.0.0`                      | Listen address      |
| `SERVER_PORT`      | `8080`                         | Listen port         |
| `DB_PATH`          | `/data/db.sqlite3`             | SQLite file         |
| `DENO_SQLITE_PATH` | `/usr/local/lib/libsqlite3.so` | SQLite library path |

**Issues I hit while containerising (all fixed):**

1. `@db/sqlite` downloads `libsqlite3.so` from GitHub on first start, so the
   container needed internet to boot. The image now pulls it at build time,
   pinned by SHA-256.
2. `deno compile` bakes in permissions at compile time. With no `--allow-*`
   flags the binary exited straight away.
3. The server listened on `127.0.0.1`, so it was unreachable from outside the
   container. Now set with `SERVER_HOST`.
4. Docker `ADD` from a URL creates files as mode `600`, so the non-root user
   couldn't load SQLite. Fixed with `ADD --chmod=644`.

**Known issue:** the binary is about 186 MB and the image 294 MB. The workspace
shares one `node_modules`, so `deno compile` pulls in the client's npm packages
(Vite, React etc.) even though the server only uses `zod`. I tried
`--entrypoint` and `--node-modules-dir=none` without luck on 2.4.2. The proper
fix is to give the server its own dependencies.

## 2. Frontend hosting

The client builds to static files in `client/build/` and calls the API at
`/api/*`. In dev, the Vite proxy forwards that to the backend and strips the
`/api` prefix. In production something else has to do that.

**What I'd recommend:**

```
               ┌────────────── CDN (TLS, caching, WAF) ──────────────┐
browser ──────►│  /*      → object storage (client/build)            │
               │  /api/*  → load balancer → server (strip /api)      │
               └─────────────────────────────────────────────────────┘
```

- **Static files** in S3 (or similar) behind CloudFront or Cloudflare. Cheap,
  cached globally, no servers.
- **Same domain for app and API.** Route `/api/*` to the backend and strip the
  prefix, so there's no CORS to deal with. Alternatively, serve the backend
  routes under `/api` and drop the rewrite.
- **TLS:** managed cert on the CDN, HTTP redirected to HTTPS.
- **Caching:** Vite's hashed files in `/assets/` can be cached for a year as
  `immutable`. `index.html` must be `no-cache` so new deploys show up straight
  away.
- **SPA fallback:** unknown paths serve `index.html`, but missing assets still
  return 404.
- **Security headers and WAF rules** at the edge.
- **Not there yet:** authentication. The brief says customers log in, but
  nothing in the code does that.

**In the repo:** [`client/Dockerfile`](client/Dockerfile) and
[`client/nginx/default.conf.template`](client/nginx/default.conf.template) do
the same thing with unprivileged nginx. That makes the design testable locally,
and it's a valid option on a container platform. The backend port isn't
published, so the only way in is via `/api`. If the backend goes down, `/api`
returns 504 and the web tier stays up.

**Caveat:** nginx resolves `server` once at startup. If the backend container
comes back with a new IP, nginx needs a reload or a `resolver` directive. On
Kubernetes, a Service gives a stable IP and avoids this.

**The frontend won't show real data yet.** It expects `brandId`/`date`, but the
API returns `brand`/`createdAt`, and dates come back as strings. With an empty
database it correctly shows "We have no insight!". This is in the handover list.

## 3. CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml)

```
PR / push ─► check (frozen install, fmt, lint, typecheck)  ─┐
          └► test (server, client, in parallel)              ─┴─► build images (amd64 + arm64)
                                                                    │  push to GHCR only on main
main only ────────────────────────────────────────────────────────► deploy staging (stub)
                                                                    ► deploy production (stub, approval)
```

- **Build once, promote.** Images are tagged `sha-<commit>` and the same image
  goes to staging then production. No rebuilds per environment.
- **Frozen installs.** `deno install --frozen` fails if `deno.lock` is out of
  date (the original lockfile failed this).
- **PRs build images but don't push,** so broken Dockerfiles get caught before
  merge.
- **Production approval** uses GitHub Environments with required reviewers.
- **Concurrency:** old PR runs are cancelled, but a deploy from `main` is never
  interrupted.
- **Caching:** Deno cache keyed on `deno.lock`; BuildKit layers cached in GitHub
  Actions.

**Stubs:** the deploy jobs write what they would do to the run summary (image
tag, rollout, `/api/_ready` smoke test, rollback to the previous `sha-*` tag).
To make them real, swap in `kubectl set image` + `kubectl rollout status`, or
`aws ecs update-service`, authenticating with OIDC rather than long-lived keys.

**What I'd add next:**

- Trivy image scanning, failing on criticals
- SBOM and provenance attestations
- Actions pinned by commit SHA
- Renovate or Dependabot
- A compose-based end-to-end smoke test on PRs
- Branch protection requiring the checks to pass

## 4. "SQLite is the fastest"

Speed isn't really the issue. The issue is operational. SQLite is a file on one
machine, so:

- **One replica only.** Multiple instances can't safely share the file, so no
  horizontal scaling and no surviving a node failure.
- **No zero-downtime deploys.** Rolling updates need two instances running at
  once, so every deploy is a short outage.
- **Backups, point-in-time recovery and failover are all on us.**

**My recommendation:**

- **For now:** one replica, a persistent volume, a `Recreate` deploy strategy,
  and [Litestream](https://litestream.io) streaming the DB to object storage for
  backup and restore.
- **Before real customers rely on it:** move to managed Postgres (RDS or Cloud
  SQL) for HA, backups, PITR and multiple replicas. It's cheap to do now, with
  one table and two queries. Add a migration tool at the same time, since the
  schema is currently a `CREATE TABLE IF NOT EXISTS` at startup.

## 5. Monitoring and observability

**What we need:**

| Signal        | What                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Health        | Liveness `/_health` (process up) and readiness `/_ready` (DB reachable). Both done                   |
| Logs          | Structured JSON with level, request ID, route, status, duration; shipped centrally                   |
| Metrics       | Request rate, errors and duration (RED) per route; DB query latency; saturation                      |
| Traces        | OpenTelemetry from nginx through the server to the DB; Deno has OTel built in (`OTEL_DENO=true`)     |
| Errors        | Error tracking (e.g. Sentry) for server and browser                                                  |
| User-side     | External synthetic checks on `/api/_ready`; front-end real-user monitoring                           |
| SLOs + alerts | e.g. 99.9% of `/api/insights` requests succeed, p95 < 300 ms; page on fast burn, ticket on slow burn |

**Done so far:**

- Added `/_ready`. The old health check said healthy while every endpoint was
  failing, which is exactly what it should catch.
- Error middleware that logs method, path and error, and returns a JSON 500
  instead of a stack trace.
- Clean shutdown on SIGTERM, so deploys don't drop requests or leave the DB
  open.

**Still to do:**

- Replace `console.log` with a structured logger. It currently logs **entire
  result sets** on every request, which won't scale and puts customer data in
  the logs.
- Request middleware for timing, status and request ID (using nginx's
  `X-Request-ID` if present).
- OpenTelemetry instrumentation and a metrics exporter.
- Return 404 for unknown IDs. Right now a miss returns `200` with an empty body,
  which hides errors in the metrics.
- A `/_version` endpoint or log line with the git SHA.
- nginx JSON access logs with upstream timing.

## Handover: not fixed

These are app bugs rather than SRE work, in priority order:

1. **SQL injection:** `insertStatement` puts values straight into the SQL
   string. It should use parameterised queries like `db.sql` does elsewhere.
2. **Create and delete aren't implemented.** They're `GET` handlers with `TODO`
   bodies, and they're registered after `/insights/:id`, so
   `GET /insights/create` is treated as a lookup with `id=create`.
3. **Client and API field names don't match:** `brand`/`createdAt` vs
   `brandId`/`date`. Dates come back as strings, not `Date` objects.
4. **No input validation:** `:id` isn't checked to be a number.
5. **`.env` is committed.** Nothing secret in it today, but it's a bad habit.
6. **Vitest noise:** the Deno Vite plugin also runs under vitest and prints
   harmless "pre-transform" errors.

## Extra for experts: going from 4 to 20 engineers

At 20 engineers the bottleneck is coordination, not infrastructure. Roughly in
order:

**First:**

1. **Safe, fast delivery:** trunk-based development, branch protection,
   CODEOWNERS, and a preview environment per PR. This pipeline is the start of
   that.
2. **Infrastructure as code:** Terraform, the same setup for dev, staging and
   prod, and secrets in a secrets manager instead of `.env` files.
3. **Easy onboarding:** `mise install` + `docker compose up` to get running, a
   template for new services, and short ADRs so decisions aren't stuck in one
   person's head (the original author's "interview accident" is a good example
   of why).

**Then:**

4. **Reliability practice:** SLOs with error budgets, an on-call rotation that
   includes developers, blameless postmortems, and runbooks linked from alerts.
5. **Feature flags,** so deploy and release are separate and 20 people can merge
   to `main` without coordinating launches.
6. **Supply chain:** automated dependency updates, image scanning and signing,
   least-privilege CI credentials via OIDC.
7. **DORA metrics** (deploy frequency, lead time, change failure rate, time to
   restore), so process changes are based on data.

## Running it

```sh
mise install                          # Deno 2.4.2
deno install --frozen
deno fmt --check && deno lint && deno check .
deno test --allow-all server
deno task test:client

docker build -t suittracker-server .                     # backend only
docker build -f client/Dockerfile -t suittracker-web .   # frontend only
docker compose up --build                                # both, on :8080
```
