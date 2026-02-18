#!/bin/bash
set -euo pipefail
# Creates Container Apps Environment and SvelteKit Container App.
# Wires Key Vault secrets as env vars via secret references (no app-side KV client needed).
#
# Usage: ./scripts/azure-managed-setup/setup-container-app.sh
# Idempotent: Can be run multiple times safely.
# Prerequisites: setup-keyvault.sh + setup-acr.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

KV_URL="https://$KEYVAULT_NAME.vault.azure.net"

echo -e "${BOLD}=== Azure Container App Setup ===${RESET}"
echo ""

# Verify ACR exists
if ! az acr show --name "$ACR_NAME" &>/dev/null; then
    echo -e "${RED}Error: ACR '$ACR_NAME' not found. Run ./setup-acr.sh first.${RESET}"
    exit 1
fi

# [1/5] Container Apps Environment
echo -e "${BOLD}[1/5] Container Apps Environment${RESET}"
if az containerapp env show --name "$CONTAINER_APP_ENV" -g "$RESOURCE_GROUP" &>/dev/null; then
    echo -e "  ${GREEN}●${RESET} Environment '$CONTAINER_APP_ENV' already exists"
else
    echo "  Creating Environment '$CONTAINER_APP_ENV' (Consumption Plan)..."
    az containerapp env create --name "$CONTAINER_APP_ENV" \
        --resource-group "$RESOURCE_GROUP" --location "$LOCATION"
    echo -e "  ${GREEN}●${RESET} Environment '$CONTAINER_APP_ENV' created"
fi

echo ""

# [2/5] Container App
echo -e "${BOLD}[2/5] Container App${RESET}"
if az containerapp show --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" &>/dev/null; then
    echo -e "  ${GREEN}●${RESET} Container App '$CONTAINER_APP_NAME' already exists"
else
    echo "  Creating Container App '$CONTAINER_APP_NAME'..."
    az containerapp create --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" --environment "$CONTAINER_APP_ENV" \
        --image "$ACR_NAME.azurecr.io/$APP_NAME:latest" \
        --registry-server "$ACR_NAME.azurecr.io" \
        --registry-identity system \
        --system-assigned \
        --ingress external --target-port 3000 --transport auto \
        --min-replicas 1 --max-replicas 3 \
        --cpu 0.5 --memory 1.0Gi \
        --env-vars \
            "NODE_ENV=production" \
            "PORT=3000" \
            "LOG_LEVEL=warn" \
            "LOG_FORMAT=json"
    echo -e "  ${GREEN}●${RESET} Container App '$CONTAINER_APP_NAME' created"
fi

echo ""

# [3/5] RBAC: Managed Identity → Key Vault
echo -e "${BOLD}[3/5] RBAC: Managed Identity → Key Vault${RESET}"
PRINCIPAL_ID=$(az containerapp identity show --name "$CONTAINER_APP_NAME" \
    -g "$RESOURCE_GROUP" --query principalId -o tsv)

if [ -z "$PRINCIPAL_ID" ]; then
    echo -e "  ${YELLOW}●${RESET} No Managed Identity found — skipping RBAC"
else
    VAULT_ID=$(az keyvault show --name "$KEYVAULT_NAME" --query id -o tsv)
    az role assignment create --role "Key Vault Secrets User" \
        --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
        --scope "$VAULT_ID" 2>/dev/null || true
    echo -e "  ${GREEN}●${RESET} Key Vault Secrets User role assigned"
fi

echo ""

# [4/5] Wire Key Vault secrets → Container App env vars
echo -e "${BOLD}[4/5] Wire Key Vault Secrets${RESET}"

# Required secrets
SECRETS_ARGS="database-url=keyvaultref:${KV_URL}/secrets/database-url,identityref:system"
SECRETS_ARGS="$SECRETS_ARGS better-auth-secret=keyvaultref:${KV_URL}/secrets/better-auth-secret,identityref:system"

# Optional secrets — only wire if they exist in KV
OPTIONAL_SECRETS=(
    "github-client-id"
    "github-client-secret"
    "sendgrid-api-key"
    "sendgrid-from"
    "azure-openai-api-key"
    "azure-resource-name"
    "azure-openai-deployment-name"
)

for secret_name in "${OPTIONAL_SECRETS[@]}"; do
    if az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "$secret_name" &>/dev/null; then
        SECRETS_ARGS="$SECRETS_ARGS ${secret_name}=keyvaultref:${KV_URL}/secrets/${secret_name},identityref:system"
        echo -e "  ${GREEN}●${RESET} $secret_name found in KV"
    fi
done

az containerapp secret set --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" \
    --secrets $SECRETS_ARGS \
    > /dev/null
echo -e "  ${GREEN}●${RESET} Key Vault secret references configured"

echo ""

# [5/5] Map secrets to env vars + set app URL
echo -e "${BOLD}[5/5] Set Environment Variables${RESET}"

APP_FQDN=$(az containerapp show --name "$CONTAINER_APP_NAME" \
    -g "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)

ENV_ARGS="DATABASE_URL=secretref:database-url"
ENV_ARGS="$ENV_ARGS BETTER_AUTH_SECRET=secretref:better-auth-secret"
ENV_ARGS="$ENV_ARGS BETTER_AUTH_URL=https://$APP_FQDN"

# Map optional secrets to env vars (parallel arrays for Bash 3.2 compatibility)
OPT_KV_NAMES=(
    "github-client-id"
    "github-client-secret"
    "sendgrid-api-key"
    "sendgrid-from"
    "azure-openai-api-key"
    "azure-resource-name"
    "azure-openai-deployment-name"
)
OPT_ENV_VARS=(
    "GITHUB_CLIENT_ID"
    "GITHUB_CLIENT_SECRET"
    "SENDGRID_API_KEY"
    "SENDGRID_FROM"
    "AZURE_OPENAI_API_KEY"
    "AZURE_RESOURCE_NAME"
    "AZURE_OPENAI_DEPLOYMENT_NAME"
)

for i in "${!OPT_KV_NAMES[@]}"; do
    if az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "${OPT_KV_NAMES[$i]}" &>/dev/null; then
        ENV_ARGS="$ENV_ARGS ${OPT_ENV_VARS[$i]}=secretref:${OPT_KV_NAMES[$i]}"
    fi
done

# Derive feature flags from available secrets (require all needed secrets)
HAS_SENDGRID_KEY=false
HAS_SENDGRID_FROM=false
HAS_AOAI_KEY=false
HAS_AOAI_RESOURCE=false
HAS_AOAI_DEPLOYMENT=false
az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "sendgrid-api-key" &>/dev/null && HAS_SENDGRID_KEY=true
az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "sendgrid-from" &>/dev/null && HAS_SENDGRID_FROM=true
az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "azure-openai-api-key" &>/dev/null && HAS_AOAI_KEY=true
az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "azure-resource-name" &>/dev/null && HAS_AOAI_RESOURCE=true
az keyvault secret show --vault-name "$KEYVAULT_NAME" --name "azure-openai-deployment-name" &>/dev/null && HAS_AOAI_DEPLOYMENT=true

if [ "$HAS_SENDGRID_KEY" = true ] && [ "$HAS_SENDGRID_FROM" = true ]; then
    ENV_ARGS="$ENV_ARGS SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=true"
fi

if [ "$HAS_AOAI_KEY" = true ] && [ "$HAS_AOAI_RESOURCE" = true ] && [ "$HAS_AOAI_DEPLOYMENT" = true ]; then
    ENV_ARGS="$ENV_ARGS AI_PROVIDER=azure"
fi

az containerapp update --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" \
    --set-env-vars $ENV_ARGS \
    > /dev/null
echo -e "  ${GREEN}●${RESET} Environment variables mapped"

echo ""

# Summary
echo -e "${BOLD}App URL:${RESET}    https://$APP_FQDN"
echo -e "${DIM}Managed Identity Principal: $PRINCIPAL_ID${RESET}"
echo ""
echo -e "${DIM}Secrets are injected as env vars via Key Vault secret references.${RESET}"
echo -e "${DIM}The app reads DATABASE_URL, BETTER_AUTH_SECRET etc. from process.env — no KV client needed.${RESET}"
