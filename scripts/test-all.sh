#!/bin/bash
# Comprehensive test runner — runs all safe test suites.
# Starts Docker test DB if not already running.
#
# Usage: ./scripts/test-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track results
declare -a RESULTS=()
TOTAL_EXIT=0

run_suite() {
  local name="$1"
  shift
  echo -e "\n${YELLOW}=== $name ===${NC}"
  if "$@"; then
    RESULTS+=("${GREEN}PASS${NC}  $name")
  else
    RESULTS+=("${RED}FAIL${NC}  $name")
    TOTAL_EXIT=1
  fi
}

# --- Ensure test DB is running ---
if ! pg_isready -h localhost -p 5433 -q 2>/dev/null; then
  echo -e "${YELLOW}Test DB not running — starting Docker containers...${NC}"
  docker compose up -d test-db
  echo -e "${YELLOW}Waiting for test DB...${NC}"
  for i in {1..30}; do
    if pg_isready -h localhost -p 5433 -q 2>/dev/null; then
      echo -e "${GREEN}Test DB ready.${NC}"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo -e "${RED}Test DB failed to start after 30 seconds.${NC}"
      exit 1
    fi
    sleep 1
  done
fi

# Set the control URL. Integration and E2E each create and clean up their own
# disposable database on this server.
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  export TEST_DATABASE_URL="postgres://root:mysecretpassword@localhost:5433/test"
  echo -e "${YELLOW}TEST_DATABASE_URL not set — using local Docker test server${NC}"
fi

echo -e "\n${GREEN}Starting test suites...${NC}"

# --- Code quality ---
run_suite "Lint (Prettier + ESLint)" npm run lint
run_suite "Type check (svelte-check)" npm run check
run_suite "Build" npm run build

# --- Tests ---
run_suite "Unit tests" npm run test:unit
run_suite "Integration tests" npm run test:integration
run_suite "E2E tests" npm run test:e2e

# --- Summary ---
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
for result in "${RESULTS[@]}"; do
  echo -e "  $result"
done
echo -e "${YELLOW}========================================${NC}"

if [ $TOTAL_EXIT -eq 0 ]; then
  echo -e "${GREEN}All test suites passed!${NC}"
else
  echo -e "${RED}Some test suites failed. Fix before pushing.${NC}"
fi

exit $TOTAL_EXIT
