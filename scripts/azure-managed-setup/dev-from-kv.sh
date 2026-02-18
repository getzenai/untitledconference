#!/bin/bash
set -euo pipefail
# Fetches secrets from Azure Key Vault and runs a command with them as env vars.
# Uses the developer's own Azure CLI identity (az login).
#
# Usage:
#   ./scripts/azure-managed-setup/dev-from-kv.sh                    # runs npm run dev
#   ./scripts/azure-managed-setup/dev-from-kv.sh npm run build      # runs any command
#   ./scripts/azure-managed-setup/dev-from-kv.sh npx drizzle-kit push

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

echo -e "${BOLD}=== Fetching secrets from Key Vault ===${RESET}"
echo -e "${DIM}Vault: $KEYVAULT_NAME${RESET}"
echo ""

# KV secret name → env var name mapping (parallel arrays for Bash 3.2 compatibility)
KV_NAMES=(
    "database-url"
    "better-auth-secret"
    "github-client-id"
    "github-client-secret"
    "sendgrid-api-key"
    "sendgrid-from"
    "azure-openai-api-key"
    "azure-resource-name"
    "azure-openai-deployment-name"
)
ENV_VARS=(
    "DATABASE_URL"
    "BETTER_AUTH_SECRET"
    "GITHUB_CLIENT_ID"
    "GITHUB_CLIENT_SECRET"
    "SENDGRID_API_KEY"
    "SENDGRID_FROM"
    "AZURE_OPENAI_API_KEY"
    "AZURE_RESOURCE_NAME"
    "AZURE_OPENAI_DEPLOYMENT_NAME"
)

# Required secrets — fail if missing
REQUIRED_SECRETS="database-url better-auth-secret"

# Fetch all secrets from KV
for i in "${!KV_NAMES[@]}"; do
    kv_name="${KV_NAMES[$i]}"
    env_var="${ENV_VARS[$i]}"
    value=$(az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "$kv_name" --query "value" -o tsv 2>/dev/null || echo "")

    if [ -n "$value" ]; then
        export "$env_var=$value"
        echo -e "  ${GREEN}●${RESET} $env_var"
    else
        # Check if this was required
        case " $REQUIRED_SECRETS " in
            *" $kv_name "*)
                echo -e "  ${RED}✗${RESET} $env_var — MISSING (required)"
                echo -e "${RED}Error: Required secret '$kv_name' not found in Key Vault '$KEYVAULT_NAME'${RESET}"
                echo -e "${DIM}Run setup-keyvault.sh and setup-db.sh first.${RESET}"
                exit 1
                ;;
        esac
        echo -e "  ${DIM}○ $env_var (not set)${RESET}"
    fi
    unset value
done

echo ""

# Non-secret configuration (set directly, allow env overrides)
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:5173}"
export BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"
export LOG_FORMAT="${LOG_FORMAT:-human}"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://root:mysecretpassword@localhost:5433/test}"

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

# Run the command (default: npm run dev)
if [ $# -eq 0 ]; then
    echo -e "${BOLD}Starting: npm run dev${RESET}"
    exec npm run dev
else
    echo -e "${BOLD}Starting: $*${RESET}"
    exec "$@"
fi
