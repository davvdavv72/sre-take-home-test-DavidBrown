# syntax=docker/dockerfile:1.7

# Frontend image: the built client served by nginx, with /api proxied to the
# backend. Build from the repo root:
#
#   docker build -f client/Dockerfile -t suittracker-web .
#
# In production the static files would more likely sit in object storage
# behind a CDN; this image is the self-contained equivalent.

ARG DENO_VERSION=2.4.2

# ---- build: bundle the client to static assets ------------------------------
# The output is plain HTML/JS/CSS, so build natively for any target platform.
FROM --platform=$BUILDPLATFORM denoland/deno:${DENO_VERSION} AS build

WORKDIR /src

COPY deno.json deno.lock ./
COPY lib/ lib/
COPY server/deno.json server/
COPY client/ client/

RUN deno install --frozen

# vite.config.ts parses these for the dev server, even though a production
# build doesn't use them; .env itself is not copied into the image.
RUN printf 'SERVER_PORT=8080\nCLIENT_PORT=3000\nSERVER_BASE_URL=http://localhost\n' > .env \
    && deno task build:client

# ---- runtime: unprivileged nginx (runs as non-root, listens on 8080) --------
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Rendered to /etc/nginx/conf.d/default.conf at startup, substituting env vars.
COPY client/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/client/build/ /usr/share/nginx/html/

ENV API_UPSTREAM=http://server:8080

EXPOSE 8080
