#!/bin/bash
set -euo pipefail
# Creates Azure PostgreSQL Flexible Server and stores DATABASE_URL in Key Vault.
# Prerequisite: setup-keyvault.sh (Key Vault must exist first)
#
# Usage: ./scripts/azure-managed-setup/setup-db.sh [--rotate-password]
# Idempotent: Can be run multiple times safely.
# Security: Credentials are stored directly in Key Vault — never printed to terminal.
#
# --rotate-password  Force password rotation even if server and KV secret already exist.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

ROTATE_PASSWORD=false
if [ "${1:-}" = "--rotate-password" ]; then
    ROTATE_PASSWORD=true
fi

echo -e "${BOLD}=== Azure PostgreSQL Setup ===${RESET}"
echo -e "${DIM}Server: $DB_SERVER_NAME | DB: $DB_NAME | RG: $RESOURCE_GROUP${RESET}"
echo ""

# Verify Key Vault exists
if ! az keyvault show --name "$KEYVAULT_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo -e "${RED}Error: Key Vault '$KEYVAULT_NAME' not found.${RESET}"
    echo -e "Run ${BOLD}./setup-keyvault.sh${RESET} first."
    exit 1
fi

# Temporarily grant Secrets Officer for storing DATABASE_URL
VAULT_ID=$(az keyvault show --name "$KEYVAULT_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)
USER_ID=$(az ad signed-in-user show --query id -o tsv)
az role assignment create \
    --role "Key Vault Secrets Officer" \
    --assignee "$USER_ID" \
    --scope "$VAULT_ID" \
    --output none 2>/dev/null || true
wait_for_kv_access "$KEYVAULT_NAME"

# [1/5] Resource Group (idempotent, may already exist from setup-keyvault.sh)
echo -e "${BOLD}[1/5] Resource Group${RESET}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
echo -e "  ${GREEN}●${RESET} $RESOURCE_GROUP"

echo ""

# Check if server and KV secret already exist (skip credentials if so)
SERVER_EXISTS=false
SECRET_EXISTS=false
if az postgres flexible-server show --name "$DB_SERVER_NAME" --resource-group "$RESOURCE_GROUP" > /dev/null 2>&1; then
    SERVER_EXISTS=true
fi
if az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "database-url" > /dev/null 2>&1; then
    SECRET_EXISTS=true
fi

NEEDS_CREDENTIALS=true
if [ "$SERVER_EXISTS" = true ] && [ "$SECRET_EXISTS" = true ] && [ "$ROTATE_PASSWORD" = false ]; then
    NEEDS_CREDENTIALS=false
fi

# [2/5] PostgreSQL Flexible Server
echo -e "${BOLD}[2/5] PostgreSQL Flexible Server${RESET}"
if [ "$SERVER_EXISTS" = true ]; then
    echo -e "  ${GREEN}●${RESET} Server '$DB_SERVER_NAME' already exists"
    if [ "$ROTATE_PASSWORD" = true ]; then
        ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)Aa1!"
        echo "  Rotating admin password (--rotate-password)..."
        az postgres flexible-server update \
            --resource-group "$RESOURCE_GROUP" \
            --name "$DB_SERVER_NAME" \
            --admin-password "$ADMIN_PASSWORD" \
            --output none
    fi
else
    ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)Aa1!"
    echo "  Creating server (this takes ~5 minutes)..."
    az postgres flexible-server create \
        --name "$DB_SERVER_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --tier Burstable \
        --sku-name Standard_B1ms \
        --storage-size 32 \
        --version 16 \
        --admin-user "$DB_ADMIN_USER" \
        --admin-password "$ADMIN_PASSWORD" \
        --public-access 0.0.0.0 \
        --yes \
        --output none
    echo -e "  ${GREEN}●${RESET} Server '$DB_SERVER_NAME' created"
fi

echo ""

# [3/5] Firewall rules
echo -e "${BOLD}[3/5] Firewall Rules${RESET}"
az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DB_SERVER_NAME" \
    --rule-name AllowAllForDev \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 255.255.255.255 \
    --output none 2>/dev/null || true
echo -e "  ${GREEN}●${RESET} AllowAllForDev (0.0.0.0 - 255.255.255.255)"

az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DB_SERVER_NAME" \
    --rule-name AllowAzureServices \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0 \
    --output none 2>/dev/null || true
echo -e "  ${GREEN}●${RESET} AllowAzureServices"

echo ""

# [4/5] Create database
echo -e "${BOLD}[4/5] Database${RESET}"
az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$DB_SERVER_NAME" \
    --database-name "$DB_NAME" \
    --output none 2>/dev/null || true
echo -e "  ${GREEN}●${RESET} Database '$DB_NAME'"

echo ""

# [5/5] Store DATABASE_URL in Key Vault
echo -e "${BOLD}[5/5] Store Credentials in Key Vault${RESET}"
if [ "$NEEDS_CREDENTIALS" = true ]; then
    DATABASE_URL="postgresql://${DB_ADMIN_USER}:${ADMIN_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

    az keyvault secret set \
        --vault-name "$KEYVAULT_NAME" \
        --name "database-url" \
        --value "$DATABASE_URL" \
        --output none

    # Clear sensitive variables immediately
    unset ADMIN_PASSWORD
    unset DATABASE_URL

    echo -e "  ${GREEN}●${RESET} database-url stored in Key Vault"
else
    echo -e "  ${GREEN}●${RESET} database-url already in Key Vault (skipped)"
    echo -e "  ${DIM}Use --rotate-password to force credential rotation${RESET}"
fi

# Downgrade back to read-only
az role assignment delete \
    --role "Key Vault Secrets Officer" \
    --assignee "$USER_ID" \
    --scope "$VAULT_ID" \
    --output none 2>/dev/null || true
az role assignment create \
    --role "Key Vault Secrets User" \
    --assignee "$USER_ID" \
    --scope "$VAULT_ID" \
    --output none 2>/dev/null || true

echo ""
echo -e "${BOLD}Done!${RESET}"
echo -e "  Server: ${GREEN}${DB_SERVER_NAME}.postgres.database.azure.com${RESET}"
echo -e "  Database: ${GREEN}${DB_NAME}${RESET}"
echo -e "  Credentials: ${GREEN}Stored in Key Vault ($KEYVAULT_NAME)${RESET}"
