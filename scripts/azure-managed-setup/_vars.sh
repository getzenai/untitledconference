#!/bin/bash
# Shared configuration for all Azure managed setup scripts.
# Customize APP_NAME and ENVIRONMENT per project.
#
# Usage: source "$(dirname "$0")/_vars.sh"

APP_NAME="${APP_NAME:-vibe-starter}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
LOCATION="${LOCATION:-germanywestcentral}"

# Derived names (Azure naming constraints applied)
RESOURCE_GROUP="rg-${APP_NAME}-${ENVIRONMENT}"
DB_SERVER_NAME="${APP_NAME}-db-${ENVIRONMENT}"
DB_NAME="${APP_NAME//-/_}"
DB_ADMIN_USER="${APP_NAME//-/}admin"
KEYVAULT_NAME="${APP_NAME}-kv-${ENVIRONMENT}"
ACR_NAME="${APP_NAME//-/}acr${ENVIRONMENT}"
CONTAINER_APP_ENV="${APP_NAME}-env-${ENVIRONMENT}"
CONTAINER_APP_NAME="${APP_NAME}-app-${ENVIRONMENT}"
STORAGE_NAME="${APP_NAME//-/}st${ENVIRONMENT}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Helper: check Azure CLI login
require_az_login() {
    if ! az account show > /dev/null 2>&1; then
        echo -e "${RED}Not logged in. Run 'az login' first.${RESET}"
        exit 1
    fi
}

# Helper: wait for RBAC propagation with retry loop
wait_for_kv_access() {
    local vault_name="$1"
    local max_attempts=12
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if az keyvault secret list --vault-name "$vault_name" --query "[0].name" -o tsv &>/dev/null; then
            return 0
        fi
        echo -e "  ${DIM}Waiting for RBAC propagation (attempt $attempt/$max_attempts)...${RESET}"
        sleep 10
        attempt=$((attempt + 1))
    done
    echo -e "  ${RED}RBAC propagation timed out after $((max_attempts * 10))s${RESET}"
    return 1
}
