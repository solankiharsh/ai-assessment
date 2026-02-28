# Deep Research Agent — Makefile
# Usage: make help

PYTHON     ?= python3
PIP        ?= pip
VENV_DIR   ?= .venv
BIN        := $(VENV_DIR)/bin
FRONTEND_DIR := frontend
# Use venv python/pip when .venv exists (after make venv)
ifeq ($(wildcard $(BIN)/activate),$(BIN)/activate)
  PYTHON := $(BIN)/python
  PIP   := $(BIN)/pip
endif

.PHONY: help venv install install-browsers env check-keys run run-quick evaluate test lint clean docker-up docker-down frontend-install frontend dev install-all

help:
	@echo "Deep Research Agent — targets:"
	@echo "  Backend (Python/CLI):"
	@echo "    make install         — create venv, install deps, copy .env.example → .env, install Playwright browsers"
	@echo "    make venv            — create virtualenv only ($(VENV_DIR))"
	@echo "    make install-browsers — install Playwright browsers (run after install if needed)"
	@echo "    make env             — copy .env.example to .env if .env missing"
	@echo "    make check-keys      — verify API keys in .env (run before make run)"
	@echo "    make run             — run investigation (edit ARGS or use: make run ARGS='\"Name\" --role X --org Y')"
	@echo "    make run-quick       — quick test (Jensen Huang, 3 iters)"
	@echo "    make evaluate        — run evaluation (make evaluate EVAL_ARGS=--all)"
	@echo "    make test            — run pytest"
	@echo "    make lint            — run ruff check"
	@echo "  Frontend (Next.js console):"
	@echo "    make frontend-install — npm install in $(FRONTEND_DIR)"
	@echo "    make frontend        — start Next.js dev server (http://localhost:3000)"
	@echo "    make dev             — same as make frontend (run console)"
	@echo "  Full stack:"
	@echo "    make install-all     — backend install + frontend-install"
	@echo "  Other:"
	@echo "    make clean           — remove __pycache__, .pytest_cache, .ruff_cache"
	@echo "    make docker-up       — start Neo4j via docker-compose"
	@echo "    make docker-down     — stop Neo4j"
	@echo ""
	@echo "First time: make install-all   then edit .env with API keys"
	@echo "Run console: make dev   (frontend reads backend outputs/ — run 'make run-quick' first to populate)"
	@echo "Examples:   make run-quick   or   make run ARGS='\"Name\" --role X --org Y'"

venv:
	$(PYTHON) -m venv $(VENV_DIR)
	@echo "Created $(VENV_DIR). Activate with: source $(BIN)/activate"

# Install in editable mode with dev deps; create .env from example if missing; install Playwright browsers.
# Ensures a venv exists first so install-browsers uses the same Python that has playwright.
install: env
	@[ -f $(BIN)/activate ] || { echo "Creating $(VENV_DIR) with $(PYTHON)..."; $(PYTHON) -m venv $(VENV_DIR); }
	$(BIN)/pip install -e ".[dev]"
	$(MAKE) install-browsers

install-browsers:
	$(PYTHON) -m playwright install

# Verify API keys from .env (Anthropic, OpenAI, Google, Tavily, Brave)
check-keys:
	$(PYTHON) scripts/check_env.py

# Copy .env.example → .env only if .env does not exist
env:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example — edit .env with your API keys."; else echo ".env already exists."; fi

# Default investigation (override ARGS)
ARGS ?= "Jensen Huang" --role CEO --org NVIDIA
run:
	$(PYTHON) -m src.main investigate $(ARGS)

run-quick:
	$(PYTHON) -m src.main investigate "Jensen Huang" --role CEO --org NVIDIA --max-iter 3

# Evaluation (e.g. make evaluate EVAL_ARGS=--all or EVAL_ARGS=--persona easy)
EVAL_ARGS ?= --all
evaluate:
	$(PYTHON) -m src.main evaluate $(EVAL_ARGS)

test:
	$(PYTHON) -m pytest tests -v

lint:
	$(PYTHON) -m ruff check src tests

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true

# When Colima is running, run Docker inside the VM via SSH (avoids host's Podman-as-docker)
COLIMA_SOCK := $(HOME)/.colima/default/docker.sock
docker-up:
	@if [ -S "$(COLIMA_SOCK)" ]; then \
		colima ssh -- sh -c "cd '$(CURDIR)' && docker compose up -d"; \
	else \
		docker compose up -d; \
	fi
	@echo "Neo4j: bolt://localhost:7687  |  Grafana: http://localhost:3001 (admin/research)  |  Prometheus: http://localhost:9090"

docker-down:
	@if [ -S "$(COLIMA_SOCK)" ]; then \
		colima ssh -- sh -c "cd '$(CURDIR)' && docker compose down"; \
	else \
		docker compose down; \
	fi

# --- Frontend (Next.js) ---
frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend:
	cd $(FRONTEND_DIR) && npm run dev

# Run the console (frontend). Backend is CLI-only; outputs/ is read by frontend API routes.
dev: frontend

# Install backend + frontend (use once)
install-all: install
	$(MAKE) frontend-install
