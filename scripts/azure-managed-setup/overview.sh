#!/bin/bash
# Azure resource overview — read-only, changes nothing.
# Usage: ./scripts/azure-managed-setup/overview.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"
require_az_login

echo -e "${BOLD}=== Azure Resource Overview ===${RESET}"
echo ""

SUBSCRIPTION=$(az account show --query "name" --output tsv)
echo -e "${DIM}Subscription: $SUBSCRIPTION${RESET}"
echo ""

# Resource Group
echo -e "${BOLD}[Resource Group]${RESET}"
if az group show --name "$RESOURCE_GROUP" > /dev/null 2>&1; then
    RG_LOCATION=$(az group show --name "$RESOURCE_GROUP" --query "location" --output tsv)
    echo -e "  ${GREEN}●${RESET} $RESOURCE_GROUP ${DIM}($RG_LOCATION)${RESET}"
    echo ""

    echo -e "${BOLD}[Resources]${RESET}"
    az resource list --resource-group "$RESOURCE_GROUP" \
        --query "[].{Name:name, Type:type, Location:location}" \
        --output table 2>/dev/null | while IFS= read -r line; do
        echo "  $line"
    done
else
    echo -e "  ${RED}●${RESET} $RESOURCE_GROUP does not exist"
    echo -e "  ${DIM}Run ./setup-keyvault.sh to create it${RESET}"
    exit 0
fi

echo ""

# PostgreSQL Server
echo -e "${BOLD}[PostgreSQL Server]${RESET}"
SERVER_JSON=$(az postgres flexible-server show --name "$DB_SERVER_NAME" --resource-group "$RESOURCE_GROUP" --output json 2>/dev/null)
if [ -n "$SERVER_JSON" ]; then
    SERVER_STATE=$(echo "$SERVER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state',''))")
    SERVER_VERSION=$(echo "$SERVER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))")
    SERVER_SKU=$(echo "$SERVER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sku',{}).get('name',''))")
    SERVER_TIER=$(echo "$SERVER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sku',{}).get('tier',''))")
    SERVER_STORAGE=$(echo "$SERVER_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('storage',{}).get('storageSizeGb',''))")

    if [ "$SERVER_STATE" == "Ready" ]; then
        echo -e "  ${GREEN}●${RESET} $DB_SERVER_NAME.postgres.database.azure.com"
    else
        echo -e "  ${RED}●${RESET} $DB_SERVER_NAME.postgres.database.azure.com ${RED}($SERVER_STATE)${RESET}"
    fi
    echo -e "  Version: $SERVER_VERSION | SKU: $SERVER_SKU ($SERVER_TIER) | Storage: ${SERVER_STORAGE}GB"

    echo -e "  Databases:"
    az postgres flexible-server db list \
        --resource-group "$RESOURCE_GROUP" --server-name "$DB_SERVER_NAME" \
        --query "[].name" --output tsv 2>/dev/null | while read -r db; do
        if [ "$db" == "$DB_NAME" ]; then
            echo -e "    ${GREEN}●${RESET} $db"
        else
            echo -e "    ${DIM}●${RESET} $db"
        fi
    done

    echo -e "  Firewall Rules:"
    az postgres flexible-server firewall-rule list \
        --resource-group "$RESOURCE_GROUP" --name "$DB_SERVER_NAME" \
        --query "[].{Rule:name, Start:startIpAddress, End:endIpAddress}" \
        --output tsv 2>/dev/null | while IFS=$'\t' read -r rule start end; do
        if [ "$start" == "0.0.0.0" ] && [ "$end" == "255.255.255.255" ]; then
            echo -e "    ${YELLOW}●${RESET} $rule ($start - $end) ${YELLOW}<- open to all${RESET}"
        else
            echo -e "    ${GREEN}●${RESET} $rule ($start - $end)"
        fi
    done
else
    echo -e "  ${RED}●${RESET} $DB_SERVER_NAME does not exist"
    echo -e "  ${DIM}Run ./setup-db.sh to create it${RESET}"
fi

echo ""

# Key Vault
echo -e "${BOLD}[Azure Key Vault]${RESET}"
VAULT_JSON=$(az keyvault show --name "$KEYVAULT_NAME" --resource-group "$RESOURCE_GROUP" --output json 2>/dev/null)
if [ -n "$VAULT_JSON" ]; then
    VAULT_URI=$(echo "$VAULT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('properties',{}).get('vaultUri',''))")

    echo -e "  ${GREEN}●${RESET} $KEYVAULT_NAME"
    echo -e "  URI: $VAULT_URI"

    echo -e "  Secrets (names only):"
    az keyvault secret list --vault-name "$KEYVAULT_NAME" \
        --query "[].name" --output tsv 2>/dev/null | while read -r secret; do
        echo -e "    ${GREEN}●${RESET} $secret"
    done
else
    echo -e "  ${RED}●${RESET} $KEYVAULT_NAME does not exist"
    echo -e "  ${DIM}Run ./setup-keyvault.sh to create it${RESET}"
fi

echo ""

# Container Registry
echo -e "${BOLD}[Azure Container Registry]${RESET}"
ACR_JSON=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --output json 2>/dev/null)
if [ -n "$ACR_JSON" ]; then
    ACR_LOGIN=$(echo "$ACR_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('loginServer',''))")
    ACR_SKU_NAME=$(echo "$ACR_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sku',{}).get('name',''))")

    echo -e "  ${GREEN}●${RESET} $ACR_NAME ${DIM}(SKU: $ACR_SKU_NAME)${RESET}"
    echo -e "  Login Server: $ACR_LOGIN"

    echo -e "  Repositories:"
    az acr repository list --name "$ACR_NAME" --output tsv 2>/dev/null | while read -r repo; do
        TAGS=$(az acr repository show-tags --name "$ACR_NAME" --repository "$repo" --orderby time_desc --top 3 --output tsv 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
        echo -e "    ${GREEN}●${RESET} $repo ${DIM}(Tags: $TAGS)${RESET}"
    done
else
    echo -e "  ${RED}●${RESET} $ACR_NAME does not exist"
    echo -e "  ${DIM}Run ./setup-acr.sh to create it${RESET}"
fi

echo ""

# Container Apps
echo -e "${BOLD}[Azure Container Apps]${RESET}"
if az containerapp env show --name "$CONTAINER_APP_ENV" -g "$RESOURCE_GROUP" &>/dev/null; then
    ENV_STATUS=$(az containerapp env show --name "$CONTAINER_APP_ENV" -g "$RESOURCE_GROUP" --query "properties.provisioningState" -o tsv 2>/dev/null)
    echo -e "  ${GREEN}●${RESET} Environment: $CONTAINER_APP_ENV ${DIM}($ENV_STATUS)${RESET}"

    APP_JSON=$(az containerapp show --name "$CONTAINER_APP_NAME" -g "$RESOURCE_GROUP" --output json 2>/dev/null)
    if [ -n "$APP_JSON" ]; then
        APP_FQDN=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('properties',{}).get('configuration',{}).get('ingress',{}).get('fqdn',''))")
        APP_IMAGE=$(echo "$APP_JSON" | python3 -c "import sys,json; c=json.load(sys.stdin).get('properties',{}).get('template',{}).get('containers',[]); print(c[0].get('image','') if c else '')")
        APP_MI=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('identity',{}).get('principalId','none'))")

        echo -e "  ${GREEN}●${RESET} App: $CONTAINER_APP_NAME"
        echo -e "    URL: https://$APP_FQDN"
        echo -e "    Image: $APP_IMAGE"
        echo -e "    Managed Identity: ${APP_MI:-none}"
    else
        echo -e "  ${RED}●${RESET} Container App '$CONTAINER_APP_NAME' does not exist"
    fi
else
    echo -e "  ${RED}●${RESET} Environment '$CONTAINER_APP_ENV' does not exist"
    echo -e "  ${DIM}Run ./setup-container-app.sh to create it${RESET}"
fi

echo ""

# Blob Storage
echo -e "${BOLD}[Azure Blob Storage]${RESET}"
STORAGE_JSON=$(az storage account show --name "$STORAGE_NAME" --output json 2>/dev/null)
if [ -n "$STORAGE_JSON" ]; then
    STORAGE_ENDPOINT=$(echo "$STORAGE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('primaryEndpoints',{}).get('blob',''))")
    STORAGE_SKU_NAME=$(echo "$STORAGE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sku',{}).get('name',''))")

    echo -e "  ${GREEN}●${RESET} $STORAGE_NAME ${DIM}(SKU: $STORAGE_SKU_NAME)${RESET}"
    echo -e "  Endpoint: $STORAGE_ENDPOINT"

    echo -e "  Containers:"
    az storage container list --account-name "$STORAGE_NAME" --auth-mode login \
        --query "[].{Name:name, Access:properties.publicAccess}" \
        --output tsv 2>/dev/null | while IFS=$'\t' read -r name access; do
        ACCESS_LABEL="private"
        if [ "$access" != "None" ] && [ -n "$access" ]; then
            ACCESS_LABEL="$access"
        fi
        echo -e "    ${GREEN}●${RESET} $name ${DIM}($ACCESS_LABEL)${RESET}"
    done
else
    echo -e "  ${RED}●${RESET} $STORAGE_NAME does not exist"
    echo -e "  ${DIM}Run ./setup-blob-storage.sh to create it (optional)${RESET}"
fi

echo ""
