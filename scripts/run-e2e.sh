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
#   The npm scripts wrap this runner with scripts/test/with-isolated-db.mjs.
#   TEST_DATABASE_URL supplies the server credentials, and the wrapper creates a
#   disposable database for this run so concurrent worktrees cannot collide.
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
# Allocate a port for this run so a preview left behind by another worktree
# cannot silently receive the Cypress traffic. There is a small race between
# releasing this probe socket and starting Vite; --strictPort below turns that
# race into a loud failure instead of falling through to a foreign server.
# FORCE_COLOR (the TUI sets it) paints `console.log(number)` yellow. That
# leaked into the URL once and made wait-on look for a host that does not
# exist. Write the port as plain bytes and mute color on this one process.
E2E_PORT="${E2E_PORT:-$(FORCE_COLOR=0 NO_COLOR=1 node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
        process.stdout.write(String(server.address().port));
        server.close();
    });
')}"
# `vite preview` emulates the Worker's bindings from wrangler.jsonc, so the app
# reads HYPERDRIVE.connectionString here exactly as it does in production. Left
# alone that is wrangler's `localConnectionString`, which points at a fixed
# database and would send the whole suite somewhere the schema was never pushed
# — every page a 500, and nothing naming the cause. This is wrangler's own
# override, and it keeps the address in one place: TEST_DATABASE_URL.
export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$TEST_DATABASE_URL"
# This script owns the preview server, so the auth base URL is fixed to it —
# a stale BETTER_AUTH_URL from .env (e.g. the dev server on :5173) would make
# Better Auth mint links and cookies for the wrong origin.
export BETTER_AUTH_URL="http://127.0.0.1:$E2E_PORT"
export BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:$E2E_PORT,http://127.0.0.1:$E2E_PORT"
export CYPRESS_BASE_URL="$BETTER_AUTH_URL"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-local-secret-not-a-real-credential}"
export ENABLE_TEST_ENDPOINTS=true
export REQUIRE_EMAIL_VERIFICATION=false
export SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=false
# A developer may have loaded the production-shaped Resend variables before
# starting this script. E2E mail addresses are invented and the outbox state is
# what the specs assert, so a test run must never cross the real provider boundary.
# Keep these unset: the point is that a real key can never be present. The
# configured-but-deaf path (#489) is a recording fake behind ENABLE_TEST_ENDPOINTS,
# armed per spec through /api/v1/test/mail-transport — not a real key.
unset RESEND_API_KEY
unset RESEND_FROM
export AI_PROVIDER="${AI_PROVIDER:-mock}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"
export NODE_ENV=test
# Reviewer-chat spec reads CYPRESS_FEATURE_INAPP_CHAT instead of guessing
# from the DOM. Default off so CI ships the panel dark. Turn both on:
#   FEATURE_INAPP_CHAT=true ./scripts/run-e2e.sh --spec cypress/e2e/critical-paths/reviewer-chat.cy.ts
export FEATURE_INAPP_CHAT="${FEATURE_INAPP_CHAT:-false}"
export CYPRESS_FEATURE_INAPP_CHAT="$FEATURE_INAPP_CHAT"
if [ "$FEATURE_INAPP_CHAT" = "true" ] || [ "$FEATURE_INAPP_CHAT" = "1" ]; then
    export AI_CHAT_MODEL="${AI_CHAT_MODEL:-mock}"
fi

echo "=== E2E environment ==="
echo "Database: ${TEST_DATABASE_URL//:*@/:***@}"
echo "Base URL: $BETTER_AUTH_URL"
echo "FEATURE_INAPP_CHAT: $FEATURE_INAPP_CHAT"
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
    "npm run preview -- --host 127.0.0.1 --port $E2E_PORT --strictPort" \
    "$BETTER_AUTH_URL" \
    "npx cypress $CYPRESS_CMD $*"
