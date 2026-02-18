#!/bin/bash
set -euo pipefail
# Creates Azure Blob Storage for file uploads.
# Usage: ./scripts/azure-managed-setup/setup-blob-storage.sh
#
# Idempotent: Can be run multiple times safely.
# Prerequisite: setup-container-app.sh (for Managed Identity RBAC)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

echo -e "${BOLD}=== Azure Blob Storage Setup ===${RESET}"
echo ""

# Storage Account
echo -e "${BOLD}[Storage Account]${RESET}"
if az storage account show --name "$STORAGE_NAME" &>/dev/null; then
    echo -e "  ${GREEN}●${RESET} Storage Account '$STORAGE_NAME' already exists"
else
    echo "  Creating Storage Account '$STORAGE_NAME' (Standard_LRS, Hot)..."
    az storage account create --name "$STORAGE_NAME" \
        --resource-group "$RESOURCE_GROUP" --location "$LOCATION" \
        --sku Standard_LRS --kind StorageV2 --access-tier Hot
    echo -e "  ${GREEN}●${RESET} Storage Account '$STORAGE_NAME' created"
fi

echo ""

# Blob Container
echo -e "${BOLD}[Blob Container]${RESET}"
az storage container create --name uploads \
    --account-name "$STORAGE_NAME" --public-access off --auth-mode login 2>/dev/null || true
echo -e "  ${GREEN}●${RESET} Container 'uploads' (private)"

echo ""

# RBAC: Container App MI → Storage Blob Data Contributor
echo -e "${BOLD}[RBAC: Managed Identity → Blob Storage]${RESET}"
if az containerapp show --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" &>/dev/null; then
    PRINCIPAL_ID=$(az containerapp identity show --name "$CONTAINER_APP_NAME" \
        -g "$RESOURCE_GROUP" --query principalId -o tsv)

    if [ -n "$PRINCIPAL_ID" ]; then
        STORAGE_ID=$(az storage account show --name "$STORAGE_NAME" --query id -o tsv)
        az role assignment create --role "Storage Blob Data Contributor" \
            --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
            --scope "$STORAGE_ID" 2>/dev/null || true
        echo -e "  ${GREEN}●${RESET} Storage Blob Data Contributor role assigned"

        az containerapp update --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" \
            --set-env-vars "BLOB_STORAGE_URL=https://$STORAGE_NAME.blob.core.windows.net" \
            > /dev/null
        echo -e "  ${GREEN}●${RESET} BLOB_STORAGE_URL set on Container App"
    else
        echo -e "  ${YELLOW}●${RESET} No Managed Identity — RBAC skipped"
    fi
else
    echo -e "  ${YELLOW}●${RESET} Container App '$CONTAINER_APP_NAME' not found — RBAC skipped"
    echo -e "  ${DIM}Run ./setup-container-app.sh first${RESET}"
fi

echo ""
echo -e "${BOLD}Storage URL:${RESET} https://$STORAGE_NAME.blob.core.windows.net"
echo -e "${DIM}Note: Storage names are alphanumeric only (Azure constraint).${RESET}"
