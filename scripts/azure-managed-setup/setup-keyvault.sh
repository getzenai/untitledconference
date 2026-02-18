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

# Helper: prompt and store a secret in KV (skip on Enter)
# Usage: prompt_secret "kv-name" "Prompt text" [--hidden]
prompt_secret() {
    local kv_name="$1"
    local prompt_text="$2"
    local hidden="${3:-}"
    local read_flags="-r"
    [ "$hidden" = "--hidden" ] && read_flags="-rs"

    local value
    read $read_flags -p "  $prompt_text (press Enter to skip): " value
    [ "$hidden" = "--hidden" ] && echo ""

    if [ -n "$value" ]; then
        az keyvault secret set \
            --vault-name "$KEYVAULT_NAME" \
            --name "$kv_name" \
            --value "$value" \
            --output none
        unset value
        echo -e "  ${GREEN}●${RESET} $kv_name stored"
    else
        echo -e "  ${DIM}$kv_name skipped${RESET}"
    fi
}

# Optional secrets — only prompt in interactive terminal
if [ -t 0 ]; then
    echo -e "  ${DIM}Press Enter to skip any optional secret${RESET}"
    echo ""

    # GitHub OAuth
    prompt_secret "github-client-id"     "GITHUB_CLIENT_ID"
    prompt_secret "github-client-secret"  "GITHUB_CLIENT_SECRET" --hidden

    # SendGrid
    prompt_secret "sendgrid-api-key"      "SENDGRID_API_KEY" --hidden
    prompt_secret "sendgrid-from"         "SENDGRID_FROM email"

    # Azure OpenAI
    prompt_secret "azure-openai-api-key"          "AZURE_OPENAI_API_KEY" --hidden
    prompt_secret "azure-resource-name"            "AZURE_RESOURCE_NAME"
    prompt_secret "azure-openai-deployment-name"   "AZURE_OPENAI_DEPLOYMENT_NAME"
else
    echo -e "  ${DIM}Non-interactive mode — skipping optional secrets${RESET}"
    echo -e "  ${DIM}Run interactively to set: github-client-*, sendgrid-*, azure-openai-*${RESET}"
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
