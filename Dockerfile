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

# Frontend: copy full tree first so path aliases resolve correctly in Docker
WORKDIR /app/frontend
COPY frontend/ ./

# Install deps and build in separate steps so Railway logs show which step failed
RUN npm ci
# Increase Node memory for Next.js build (helps avoid OOM on free tier)
ENV NODE_OPTIONS="--max-old-space-size=4096"
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
