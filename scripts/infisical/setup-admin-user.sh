#!/bin/bash
set -euo pipefail
# Creates the first admin user via the test registration endpoint.
# The first registered user automatically becomes admin.
#
# Prerequisites:
#   - Dev server running with ENABLE_TEST_ENDPOINTS=true
#   - Database schema pushed (npm run db:push)
#
# Usage:
#   ./scripts/infisical/setup-admin-user.sh                           # uses defaults
#   ./scripts/infisical/setup-admin-user.sh admin@test.com MyPass123   # custom credentials
#   BASE_URL=http://localhost:5174 ./scripts/infisical/setup-admin-user.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

EMAIL="${1:-admin@example.com}"
PASSWORD="${2:-AdminPass123!}"
ORG_NAME="${3:-Default Organization}"
BASE_URL="${BASE_URL:-http://localhost:5173}"

echo -e "${BOLD}Creating admin user${RESET}"
echo -e "${DIM}  Email: $EMAIL${RESET}"
echo -e "${DIM}  URL:   $BASE_URL${RESET}"
echo ""

# Wait for server to be ready (max 30 seconds)
echo -e "${DIM}Waiting for server...${RESET}"
for i in $(seq 1 30); do
    if curl -sf "$BASE_URL/api/v1/public/health" > /dev/null 2>&1; then
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo -e "${RED}Server not responding at $BASE_URL after 30s${RESET}"
        exit 1
    fi
    sleep 1
done

# Register the first user (becomes admin automatically)
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/test/register" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$EMAIL\",
        \"password\": \"$PASSWORD\",
        \"organizationName\": \"$ORG_NAME\"
    }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}Admin user created successfully!${RESET}"
    echo -e "${DIM}$BODY${RESET}"
    echo ""
    echo -e "${BOLD}Credentials:${RESET}"
    echo -e "  Email:    $EMAIL"
    echo -e "  Password: $PASSWORD"
else
    echo -e "${RED}Failed to create admin user (HTTP $HTTP_CODE)${RESET}"
    echo -e "${DIM}$BODY${RESET}"
    exit 1
fi
