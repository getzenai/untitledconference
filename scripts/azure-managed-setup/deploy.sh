#!/bin/bash
set -euo pipefail
# Builds Docker image via ACR (server-side) and updates the Container App.
# Usage: ./scripts/azure-managed-setup/deploy.sh [TAG]
#
# Repeatable: Run for each deployment.
# Prerequisites: setup-acr.sh + setup-container-app.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

TAG="${1:-latest}"

echo -e "${BOLD}=== Deploy ===${RESET}"
echo -e "${DIM}Tag: $TAG${RESET}"
echo ""

# Verify ACR exists
if ! az acr show --name "$ACR_NAME" &>/dev/null; then
    echo -e "${RED}Error: ACR '$ACR_NAME' not found. Run ./setup-acr.sh first.${RESET}"
    exit 1
fi

# [1/2] Build and push image (server-side build — no local Docker needed)
echo -e "${BOLD}[1/2] Building and pushing image...${RESET}"
az acr build --registry "$ACR_NAME" \
    --image "$APP_NAME:$TAG" \
    "$PROJECT_ROOT"

echo -e "  ${GREEN}●${RESET} Image $ACR_NAME.azurecr.io/$APP_NAME:$TAG pushed"
echo ""

# [2/2] Update Container App
if az containerapp show --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" &>/dev/null; then
    echo -e "${BOLD}[2/2] Updating Container App...${RESET}"
    az containerapp update --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" \
        --image "$ACR_NAME.azurecr.io/$APP_NAME:$TAG"

    FQDN=$(az containerapp show --name "$CONTAINER_APP_NAME" \
        -g "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)
    echo -e "  ${GREEN}●${RESET} Container App updated"
    echo ""
    echo -e "${BOLD}URL:${RESET} https://$FQDN"
else
    echo -e "${DIM}[2/2] Container App '$CONTAINER_APP_NAME' not found — only image pushed.${RESET}"
    echo -e "${DIM}Run ./setup-container-app.sh first.${RESET}"
fi
