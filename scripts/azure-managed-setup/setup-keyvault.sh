#!/bin/bash
set -euo pipefail
# Creates Azure Key Vault and stores application secrets.
# Must run FIRST — other scripts store credentials directly in this Key Vault.
#
# Usage: ./scripts/azure-managed-setup/setup-keyvault.sh
# Idempotent: Can be run multiple times safely.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

echo -e "${BOLD}=== Azure Key Vault Setup ===${RESET}"
echo -e "${DIM}Vault: $KEYVAULT_NAME | RG: $RESOURCE_GROUP | Region: $LOCATION${RESET}"
echo ""

SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "Subscription: ${BOLD}$SUBSCRIPTION${RESET}"
echo ""

# [1/5] Resource Group
echo -e "${BOLD}[1/5] Resource Group${RESET}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
echo -e "  ${GREEN}●${RESET} $RESOURCE_GROUP ($LOCATION)"

echo ""

# [2/5] Key Vault
echo -e "${BOLD}[2/5] Key Vault${RESET}"
if az keyvault show --name "$KEYVAULT_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo -e "  ${GREEN}●${RESET} Key Vault '$KEYVAULT_NAME' already exists"
else
    echo "  Creating Key Vault '$KEYVAULT_NAME'..."
    az keyvault create \
        --name "$KEYVAULT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --enable-rbac-authorization true \
        --output none
    echo -e "  ${GREEN}●${RESET} Key Vault created (RBAC-enabled)"
fi

echo ""

# [3/5] RBAC: Grant current user Secrets Officer (temporary, for writing secrets)
echo -e "${BOLD}[3/5] RBAC Setup${RESET}"
VAULT_ID=$(az keyvault show --name "$KEYVAULT_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)
USER_ID=$(az ad signed-in-user show --query id -o tsv)
USER_NAME=$(az ad signed-in-user show --query userPrincipalName -o tsv)

echo -e "  User: $USER_NAME"

az role assignment create \
    --role "Key Vault Secrets Officer" \
    --assignee "$USER_ID" \
    --scope "$VAULT_ID" \
    --output none 2>/dev/null || true
echo -e "  ${GREEN}●${RESET} Temporary 'Secrets Officer' role assigned"

wait_for_kv_access "$KEYVAULT_NAME"

echo ""

# [4/5] Store secrets
echo -e "${BOLD}[4/5] Store Secrets${RESET}"

# Auto-generate BETTER_AUTH_SECRET
EXISTING_SECRET=$(az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "better-auth-secret" --query "value" -o tsv 2>/dev/null || echo "")
if [ -z "$EXISTING_SECRET" ]; then
    AUTH_SECRET=$(openssl rand -base64 32)
    az keyvault secret set \
        --vault-name "$KEYVAULT_NAME" \
        --name "better-auth-secret" \
        --value "$AUTH_SECRET" \
        --output none
    unset AUTH_SECRET
    echo -e "  ${GREEN}●${RESET} better-auth-secret (auto-generated)"
else
    echo -e "  ${GREEN}●${RESET} better-auth-secret (already exists)"
fi
unset EXISTING_SECRET

# Optional secrets — only prompt in interactive terminal
if [ -t 0 ]; then
    read -rsp "  SENDGRID_API_KEY (press Enter to skip): " SENDGRID_KEY
    echo ""
    if [ -n "$SENDGRID_KEY" ]; then
        az keyvault secret set \
            --vault-name "$KEYVAULT_NAME" \
            --name "sendgrid-api-key" \
            --value "$SENDGRID_KEY" \
            --output none
        unset SENDGRID_KEY
        echo -e "  ${GREEN}●${RESET} sendgrid-api-key stored"
    else
        echo -e "  ${DIM}sendgrid-api-key skipped${RESET}"
    fi

    read -rp "  SENDGRID_FROM email (press Enter to skip): " SENDGRID_FROM_VAL
    if [ -n "$SENDGRID_FROM_VAL" ]; then
        az keyvault secret set \
            --vault-name "$KEYVAULT_NAME" \
            --name "sendgrid-from" \
            --value "$SENDGRID_FROM_VAL" \
            --output none
        unset SENDGRID_FROM_VAL
        echo -e "  ${GREEN}●${RESET} sendgrid-from stored"
    else
        echo -e "  ${DIM}sendgrid-from skipped${RESET}"
    fi
else
    echo -e "  ${DIM}Non-interactive mode — skipping optional secrets (SendGrid)${RESET}"
    echo -e "  ${DIM}Run interactively to set: sendgrid-api-key, sendgrid-from${RESET}"
fi

echo ""

# [5/5] Downgrade to read-only
echo -e "${BOLD}[5/5] RBAC Least Privilege${RESET}"

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

echo -e "  ${GREEN}●${RESET} Developer now has ${BOLD}READ-ONLY${RESET} access (Key Vault Secrets User)"

echo ""
echo -e "${BOLD}Done!${RESET}"
echo -e "  Key Vault: ${GREEN}https://${KEYVAULT_NAME}.vault.azure.net/${RESET}"
echo -e "  ${DIM}To update secrets: run this script again${RESET}"
