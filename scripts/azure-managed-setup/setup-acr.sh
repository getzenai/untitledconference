#!/bin/bash
set -euo pipefail
# Creates Azure Container Registry for Docker images.
# Usage: ./scripts/azure-managed-setup/setup-acr.sh
#
# Idempotent: Can be run multiple times safely.
# Prerequisite: az login

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

echo -e "${BOLD}=== Azure Container Registry Setup ===${RESET}"
echo ""

if az acr show --name "$ACR_NAME" &>/dev/null; then
    echo -e "${GREEN}●${RESET} ACR '$ACR_NAME' already exists"
else
    echo "Creating ACR '$ACR_NAME' (Basic SKU)..."
    az acr create --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" --sku Basic
    echo -e "${GREEN}●${RESET} ACR '$ACR_NAME' created"
fi

echo ""
echo -e "${BOLD}Login Server:${RESET} $ACR_NAME.azurecr.io"
echo -e "${DIM}Note: ACR names are alphanumeric only (Azure constraint).${RESET}"
