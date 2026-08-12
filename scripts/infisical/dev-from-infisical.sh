#!/bin/bash
set -euo pipefail
# Fetches secrets from Infisical Cloud and runs a command with them as env vars.
# Uses the developer's own Infisical CLI identity (infisical login).
#
# Supports two development modes:
#   Cloud DB mode (default): No .env file → all secrets from Infisical
#   Local Docker mode:       .env with DATABASE_URL/TEST_DATABASE_URL → DB from Docker, rest from Infisical
#
# Usage:
#   ./scripts/infisical/dev-from-infisical.sh                    # runs npm run dev:vite
#   ./scripts/infisical/dev-from-infisical.sh npm run build      # runs any command
#   ./scripts/infisical/dev-from-infisical.sh npx drizzle-kit push

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Source .env if it exists (picks up local Docker DB URLs)
if [ -f "$PROJECT_DIR/.env" ]; then
    set +u  # temporarily disable nounset for .env sourcing
    set -a
    source "$PROJECT_DIR/.env"
    set +a
    set -u
fi

# Infisical is how this project's own developers get their secrets, not a
# requirement of the app. A clone that keeps everything in .env is a first-class
# way to run this: without the CLI (or without a login) we say so and carry on,
# and the REQUIRED_VARS check below is what actually decides whether the
# environment is complete.
INFISICAL_OUTPUT=""
if ! command -v infisical &>/dev/null; then
    echo -e "${YELLOW}Infisical CLI not installed — using .env and the shell environment only.${RESET}"
    echo -e "${DIM}Install it to pull shared secrets: brew install infisical/get-cli/infisical${RESET}"
    echo ""
fi

# Detect mode based on whether DATABASE_URL is already set (from .env)
if [ -n "${DATABASE_URL:-}" ]; then
    echo -e "${BOLD}=== Local DB Mode ===${RESET}"
    echo -e "${DIM}DATABASE_URL from .env or the shell${RESET}"
elif command -v infisical &>/dev/null; then
    echo -e "${BOLD}=== Cloud DB Mode ===${RESET}"
    echo -e "${DIM}All secrets from Infisical${RESET}"
fi
echo ""

# Fetch secrets from Infisical (dotenv format: KEY=VALUE per line)
if command -v infisical &>/dev/null; then
    INFISICAL_OUTPUT=$(infisical export --format=dotenv 2>/dev/null) || {
        echo -e "${YELLOW}Could not fetch secrets from Infisical — using .env and the shell environment only.${RESET}"
        echo -e "${DIM}For the shared project secrets: 'infisical login', and check the workspaceId in .infisical.json.${RESET}"
        echo ""
        INFISICAL_OUTPUT=""
    }
fi

# Required env vars — fail if not set after all sources checked
REQUIRED_VARS="DATABASE_URL BETTER_AUTH_SECRET"

# Parse Infisical output and export (skip if env var already set from .env or shell)
while IFS= read -r line; do
    # Skip empty lines and comments
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue

    # Split on first = only
    key="${line%%=*}"
    value="${line#*=}"

    # Remove surrounding quotes from value (dotenv format may quote them)
    if [[ "$value" == \"*\" ]]; then
        value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' ]]; then
        value="${value:1:${#value}-2}"
    fi

    # Skip if env var is already set (from .env or shell)
    current_value="${!key:-}"
    if [ -n "$current_value" ]; then
        echo -e "  ${GREEN}●${RESET} $key (from environment)"
        continue
    fi

    export "$key=$value"
    echo -e "  ${GREEN}●${RESET} $key (from Infisical)"
done <<< "$INFISICAL_OUTPUT"

# Validate required secrets
for var in $REQUIRED_VARS; do
    if [ -z "${!var:-}" ]; then
        echo -e "  ${RED}✗${RESET} $var — MISSING (required)"
        echo -e "${RED}Error: Required secret '$var' is not set${RESET}"
        echo -e "${DIM}Set it in .env (see .env.example), or add it to your Infisical project.${RESET}"
        exit 1
    fi
done

echo ""

# `vite dev` emulates the Worker's bindings from wrangler.jsonc (adapter-cloudflare
# `platformProxy`), and the app reads HYPERDRIVE.connectionString wherever the
# binding is present. Left alone that is wrangler's `localConnectionString` — a
# fixed address that is not the one validated above, so dev would either 500 or,
# worse, quietly read and write a different database than the developer
# configured. Point the binding at DATABASE_URL so there is one answer to "which
# database am I on" locally, the same thing `run-e2e.sh` does with
# TEST_DATABASE_URL.
export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="${WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:-$DATABASE_URL}"

# Non-secret configuration (set directly, allow env overrides)
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:5173}"
export BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"
export LOG_FORMAT="${LOG_FORMAT:-human}"

# Derive feature flags from available secrets
if [ -n "${SENDGRID_API_KEY:-}" ] && [ -n "${SENDGRID_FROM:-}" ]; then
    export SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG="${SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG:-true}"
else
    export SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG="${SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG:-false}"
fi

echo -e "${DIM}Config: BETTER_AUTH_URL=$BETTER_AUTH_URL | LOG_LEVEL=$LOG_LEVEL${RESET}"
echo ""

# Run the command (default: npm run dev:vite)
if [ $# -eq 0 ]; then
    echo -e "${BOLD}Starting: npm run dev:vite${RESET}"
    exec npm run dev:vite
elif [[ "$1" == -* ]]; then
    echo -e "${BOLD}Starting: npm run dev:vite $*${RESET}"
    exec npm run dev:vite -- "$@"
else
    echo -e "${BOLD}Starting: $*${RESET}"
    exec "$@"
fi
