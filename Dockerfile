# syntax=docker/dockerfile:1.7

# Backend image for the Suit Tracker Insights server.
#
#   docker build -t suittracker-server .
#   docker run -p 8080:8080 -v suittracker-data:/data suittracker-server
#
# Builds for linux/amd64 and linux/arm64 (docker buildx --platform ...).

ARG DENO_VERSION=2.4.2

# ---- build: compile the server to a standalone binary ----------------------
# Runs on the build machine's native platform and cross-compiles for the
# target, so arm64 images build without emulation.
FROM --platform=$BUILDPLATFORM denoland/deno:${DENO_VERSION} AS build

WORKDIR /src

COPY deno.json deno.lock ./
COPY client/deno.json client/
COPY lib/ lib/
COPY server/ server/

# Fail the build if deno.lock is out of date.
# Note: the workspace shares one node_modules, so the client's npm packages
# (vite, react, ...) also end up embedded in the binary (~90MB).
RUN deno install --frozen

ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) export ARCH=x86_64-unknown-linux-gnu ;; \
      arm64) export ARCH=aarch64-unknown-linux-gnu ;; \
      *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && deno task --cwd=server build

# @db/sqlite downloads its native library from GitHub on first run unless
# DENO_SQLITE_PATH is set. Fetch it here instead, pinned by checksum, so the
# container never needs network access at startup.
# Keep the version in step with @db/sqlite in server/deno.json.
# URL downloads default to mode 600 (root only); the server runs as non-root.
ADD --chmod=644 --checksum=sha256:c3282f7b247167eb1f2e63bdbd99cdd7def5095932453329e68dae252312f52d \
    https://github.com/denodrivers/sqlite3/releases/download/0.12.0/libsqlite3.so \
    /sqlite/amd64/libsqlite3.so
ADD --chmod=644 --checksum=sha256:2f111b054cbcde606e0c99e4c237a491970248e97b2b8f6a4ee1998f73ace9fd \
    https://github.com/denodrivers/sqlite3/releases/download/0.12.0/libsqlite3_aarch64.so \
    /sqlite/arm64/libsqlite3.so

# Distroless has no shell, so create the data directory here.
RUN mkdir -p /data

# ---- runtime: glibc + libgcc only, no shell or package manager --------------
FROM gcr.io/distroless/cc-debian12:nonroot

ARG TARGETARCH

COPY --from=build /src/server/build/server /app/server
COPY --from=build /sqlite/${TARGETARCH}/libsqlite3.so /usr/local/lib/libsqlite3.so
COPY --from=build --chown=65532:65532 /data /data

ENV SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8080 \
    DB_PATH=/data/db.sqlite3 \
    DENO_SQLITE_PATH=/usr/local/lib/libsqlite3.so

USER 65532:65532
EXPOSE 8080
VOLUME ["/data"]

# Exec form: the server runs as PID 1 and receives SIGTERM directly.
ENTRYPOINT ["/app/server"]
