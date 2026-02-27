# Deep Research Agent — single service for Railway: Next.js + Python backend (spawned by API routes)
# Frontend serves UI and /api/*; POST /api/investigate spawns `python -m src.main investigate` from REPO_ROOT.

FROM node:20-bookworm-slim

# Python 3.11 + venv for backend CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend: virtualenv and install from pyproject.toml
RUN python3.11 -m venv .venv
ENV PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml ./
COPY src ./src
COPY config ./config
COPY scripts ./scripts

RUN pip install --no-cache-dir -e .

# Playwright Chromium for tiered fetch (Tier 2). Skip if not needed to save image size.
RUN playwright install chromium --with-deps || true

# Frontend: install and build with robust layering
WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source code
COPY frontend/ ./

# Verify the critical file for shadcn resolution
RUN ls -la src/lib/utils.ts || (echo "CRITICAL: utils.ts missing in frontend/src/lib!" && exit 1)

# Build
ENV NODE_OPTIONS="--max-old-space-size=4096" \
    NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# Runtime env: Next.js and spawn backend from /app
ENV REPO_ROOT=/app \
    BACKEND_PYTHON=/app/.venv/bin/python \
    OUTPUT_DIR=/app/outputs \
    NODE_ENV=production

# Railway sets PORT; Next.js uses it automatically
EXPOSE 3000
WORKDIR /app/frontend
CMD ["npm", "run", "start"]
