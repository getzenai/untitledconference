#!/bin/bash
# Run the Cypress E2E suite against a production preview build.
#
# Usage:
#   ./scripts/run-e2e.sh                                     # all specs, headless
#   ./scripts/run-e2e.sh open                                # interactive runner
#   ./scripts/run-e2e.sh --headed                            # headed run
#   ./scripts/run-e2e.sh --spec cypress/e2e/critical-paths/login-workflow.cy.ts
#
# Database:
#   TEST_DATABASE_URL is used if set (env or .env, e.g. from Infisical via
#   ./scripts/infisical/dev-from-infisical.sh); otherwise it falls back to the
#   local Docker test database from docker-compose.yml (port 5433).
#
# No real secrets are needed: E2E runs with a throwaway BETTER_AUTH_SECRET and
# the test endpoints enabled, exactly like the CI job does.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Pick up TEST_DATABASE_URL from .env if it is not already exported.
if [ -f "$ROOT/.env" ] && [ -z "${TEST_DATABASE_URL:-}" ]; then
    set +u
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
    set -u
fi

export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://root:mysecretpassword@localhost:5433/test}"
export DATABASE_URL="$TEST_DATABASE_URL"
# `vite preview` emulates the Worker's bindings from wrangler.jsonc, so the app
# reads HYPERDRIVE.connectionString here exactly as it does in production. Left
# alone that is wrangler's `localConnectionString`, which points at a fixed
# database and would send the whole suite somewhere the schema was never pushed
# — every page a 500, and nothing naming the cause. This is wrangler's own
# override, and it keeps the address in one place: TEST_DATABASE_URL.
export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$TEST_DATABASE_URL"
# This script owns the preview server, so the auth base URL is fixed to it -
# a stale BETTER_AUTH_URL from .env (e.g. the dev server on :5173) would make
# Better Auth mint links and cookies for the wrong origin.
export BETTER_AUTH_URL="http://localhost:5174"
export BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:5174,http://127.0.0.1:5174"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-local-secret-not-a-real-credential}"
export ENABLE_TEST_ENDPOINTS=true
export REQUIRE_EMAIL_VERIFICATION=false
export SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=false
export AI_PROVIDER="${AI_PROVIDER:-mock}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"
export NODE_ENV=test

echo "=== E2E environment ==="
echo "Database: ${TEST_DATABASE_URL//:*@/:***@}"
echo "Base URL: $BETTER_AUTH_URL"
echo ""

echo "=== Pushing database schema ==="
npx drizzle-kit push --force

if [ "${SKIP_BUILD:-}" != "true" ]; then
    echo ""
    echo "=== Building application ==="
    npm run build
fi

CYPRESS_CMD="run"
if [ "${1:-}" = "open" ]; then
    CYPRESS_CMD="open"
    shift
fi

echo ""
echo "=== Starting preview server and running Cypress ==="
npx start-server-and-test \
    "npm run preview -- --port 5174" \
    "http://localhost:5174" \
    "npx cypress $CYPRESS_CMD $*"
