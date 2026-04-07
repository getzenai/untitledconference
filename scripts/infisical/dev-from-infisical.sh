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

# Check infisical CLI is installed
if ! command -v infisical &>/dev/null; then
    echo -e "${RED}Infisical CLI not installed.${RESET}"
    echo -e "${DIM}Install: brew install infisical/get-cli/infisical${RESET}"
    echo -e "${DIM}  or:    npm install -g @infisical/cli${RESET}"
    exit 1
fi

# Detect mode based on whether DATABASE_URL is already set (from .env)
if [ -n "${DATABASE_URL:-}" ]; then
    echo -e "${BOLD}=== Local Docker Mode ===${RESET}"
    echo -e "${DIM}DATABASE_URL from .env — fetching remaining secrets from Infisical${RESET}"
else
    echo -e "${BOLD}=== Cloud DB Mode ===${RESET}"
    echo -e "${DIM}All secrets from Infisical${RESET}"
fi
echo ""

# Fetch secrets from Infisical (dotenv format: KEY=VALUE per line)
INFISICAL_OUTPUT=$(infisical export --format=dotenv 2>/dev/null) || {
    echo -e "${RED}Failed to fetch secrets from Infisical.${RESET}"
    echo -e "${DIM}Run 'infisical login' first, then ensure .infisical.json has the correct workspaceId.${RESET}"
    exit 1
}

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
        echo -e "${RED}Error: Required secret '$var' not found in Infisical and not set in environment${RESET}"
        echo -e "${DIM}Add '$var' to your Infisical project, or set it in .env for local Docker mode.${RESET}"
        exit 1
    fi
done

echo ""

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

if [ -n "${AZURE_OPENAI_API_KEY:-}" ] && [ -n "${AZURE_RESOURCE_NAME:-}" ] && [ -n "${AZURE_OPENAI_DEPLOYMENT_NAME:-}" ]; then
    export AI_PROVIDER="${AI_PROVIDER:-azure}"
else
    export AI_PROVIDER="${AI_PROVIDER:-mock}"
    if [ -n "${AZURE_OPENAI_API_KEY:-}" ]; then
        echo -e "  ${YELLOW}⚠${RESET} Azure OpenAI API key found but missing AZURE_RESOURCE_NAME or AZURE_OPENAI_DEPLOYMENT_NAME — using mock provider"
    fi
fi

echo -e "${DIM}Config: BETTER_AUTH_URL=$BETTER_AUTH_URL | LOG_LEVEL=$LOG_LEVEL | AI_PROVIDER=$AI_PROVIDER${RESET}"
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
