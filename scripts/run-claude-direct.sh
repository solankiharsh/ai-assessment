#!/usr/bin/env bash
# Run Claude CLI against direct Anthropic API (no proxy) to avoid auth conflict
# and LiteLLM 401. Use with: ./scripts/run-claude-direct.sh [claude args...]
# Example: ./scripts/run-claude-direct.sh --model claude-opus-4-6 --print "Hello"
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Resolve auth conflict: use only API key, no auth token
unset ANTHROPIC_AUTH_TOKEN
# Optional: use proxy. Comment out to use direct Anthropic API.
# export ANTHROPIC_BASE_URL="https://litellm.deriv.ai"
unset ANTHROPIC_BASE_URL

# Load project .env for ANTHROPIC_API_KEY (direct Anthropic key)
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY not set. Add it to .env or export it." >&2
  exit 1
fi

exec claude "$@"
