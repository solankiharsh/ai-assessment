# Deep Research Agent — single service for Railway: Next.js + Python backend (spawned by API routes)
# Frontend serves UI and /api/*; POST /api/investigate spawns `python -m src.main investigate` from REPO_ROOT.
# Multi-stage build keeps image under 4 GB: no Playwright Chromium, Next.js standalone in final stage.

# -----------------------------------------------------------------------------
# Stage 1: build backend + frontend
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3.11 -m venv .venv
ENV PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml ./
COPY src ./src
COPY config ./config
COPY scripts ./scripts
COPY outputs_captured ./outputs

RUN pip install --no-cache-dir -e .

WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend ./

ENV NODE_OPTIONS="--max-old-space-size=4096" NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# -----------------------------------------------------------------------------
# Stage 2: runtime image (backend + Next.js standalone only)
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3.11 -m venv .venv
ENV PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml ./
COPY src ./src
COPY config ./config
COPY scripts ./scripts
COPY outputs_captured ./outputs

RUN pip install --no-cache-dir -e .

# Next.js standalone: server + minimal deps (no full node_modules)
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public
# Standalone tracer can miss @swc/helpers (used by next server runtime); copy from builder
COPY --from=builder /app/frontend/node_modules/@swc /app/node_modules/@swc

ENV NODE_ENV=production \
    REPO_ROOT=/app \
    BACKEND_PYTHON=/app/.venv/bin/python \
    OUTPUT_DIR=/app/outputs \
    HOSTNAME=0.0.0.0 \
    PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
