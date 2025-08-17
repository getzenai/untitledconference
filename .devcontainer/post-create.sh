#!/bin/bash
set -e

echo "🚀 Setting up your development environment..."

# Install PostgreSQL client tools
echo "🐘 Installing PostgreSQL client tools..."
sudo apt-get update && sudo apt-get install -y postgresql-client

# Install dependencies first (as recommended by GitHub docs)
echo "📦 Installing npm dependencies..."
npm install

# Wait for PostgreSQL to be ready (with timeout)
echo "⏳ Waiting for PostgreSQL to be ready..."
timeout=30  # Maximum wait time in seconds
elapsed=0
while ! pg_isready -h localhost -p 5432 -U root > /dev/null 2>&1; do
  if [ $elapsed -ge $timeout ]; then
    echo "❌ Error: PostgreSQL did not become ready within ${timeout} seconds"
    echo "Please check if the PostgreSQL container is running properly"
    exit 1
  fi
  echo "Waiting for PostgreSQL... (${elapsed}s/${timeout}s)"
  sleep 2
  elapsed=$((elapsed + 2))
done
echo "✅ PostgreSQL is ready!"

# Set up environment files
echo "🔧 Setting up environment files..."
if [ ! -f .env ]; then
  cat > .env << EOF
DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"
BETTER_AUTH_SECRET="dev_codespaces_default_secret_change_in_production"
BETTER_AUTH_URL="http://localhost:5173"

# GitHub OAuth (optional - only if you want GitHub sign-in)
GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"
EOF
  echo "✅ Created .env file with default dev values"
fi

if [ ! -f .env.e2e ]; then
  cat > .env.e2e << EOF
DATABASE_URL="postgres://root:mysecretpassword@localhost:5433/test"
BETTER_AUTH_SECRET="dev_codespaces_default_secret_change_in_production"
BETTER_AUTH_URL="http://localhost:5174"
NODE_ENV="test"
PLAYWRIGHT_TEST="true"

# GitHub OAuth (optional)
GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"
EOF
  echo "✅ Created .env.e2e file"
fi

# Run database migrations
echo "🗄️ Setting up database..."
npm run db:push:force

# Install Playwright browsers if needed
echo "🎭 Installing Playwright browsers..."
npx playwright install chromium --with-deps

# Install Claude Code CLI
echo "🤖 Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# Check environment configuration status
echo ""
echo "🔍 Checking environment configuration..."

# Check required secrets
REQUIRED_CONFIGS_OK=true
OPTIONAL_CONFIGS=""

# Check DATABASE_URL (required)
if [ -n "${DATABASE_URL}" ] || [ -f .env ] && grep -q "DATABASE_URL=" .env; then
  echo "✅ DATABASE_URL is configured"
else
  echo "❌ DATABASE_URL is missing (but will use default for dev)"
  REQUIRED_CONFIGS_OK=false
fi

# Check BETTER_AUTH_SECRET (required)
if [ -n "${BETTER_AUTH_SECRET}" ] || [ -f .env ] && grep -q "BETTER_AUTH_SECRET=" .env; then
  echo "✅ BETTER_AUTH_SECRET is configured"
else
  echo "❌ BETTER_AUTH_SECRET is missing (but will use default for dev)"
  REQUIRED_CONFIGS_OK=false
fi

# Check BETTER_AUTH_URL (required)
if [ -n "${BETTER_AUTH_URL}" ] || [ -f .env ] && grep -q "BETTER_AUTH_URL=" .env; then
  echo "✅ BETTER_AUTH_URL is configured"
else
  echo "❌ BETTER_AUTH_URL is missing (but will use default for dev)"
  REQUIRED_CONFIGS_OK=false
fi

# Check optional GitHub OAuth
if [ -n "${GITHUB_CLIENT_ID}" ] && [ -n "${GITHUB_CLIENT_SECRET}" ]; then
  echo "✅ GitHub OAuth is configured (Sign in with GitHub will work)"
  OPTIONAL_CONFIGS="${OPTIONAL_CONFIGS}  ✅ GitHub OAuth: Configured\n"
else
  echo "ℹ️  GitHub OAuth not configured (Sign in with GitHub disabled)"
  OPTIONAL_CONFIGS="${OPTIONAL_CONFIGS}  ℹ️  GitHub OAuth: Not configured (optional)\n"
fi

# Check Claude Code token
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN}" ]; then
  echo "✅ Claude Code OAuth token is configured"
  OPTIONAL_CONFIGS="${OPTIONAL_CONFIGS}  ✅ Claude Code: Ready to use\n"
else
  echo "ℹ️  Claude Code OAuth token not configured"
  OPTIONAL_CONFIGS="${OPTIONAL_CONFIGS}  ℹ️  Claude Code: Token needed (run 'claude setup-token' locally)\n"
fi

# Create a welcome message
cat << EOF

════════════════════════════════════════════════════════════════════════════════

🎉 Your SvelteKit Vibe Starter development environment is ready!

📋 Environment Configuration Status:
EOF

if [ "$REQUIRED_CONFIGS_OK" = true ]; then
  echo "  ✅ All required configurations are in place"
else
  echo "  ⚠️  Using default dev values for missing configurations"
fi

printf "${OPTIONAL_CONFIGS}"

cat << EOF

🔐 Required Secrets (with defaults for dev):
  • DATABASE_URL - PostgreSQL connection string
  • BETTER_AUTH_SECRET - Authentication secret key  
  • BETTER_AUTH_URL - Authentication service URL

🔑 Optional Secrets:
  • GITHUB_CLIENT_ID/SECRET - Enable "Sign in with GitHub"
  • CLAUDE_CODE_OAUTH_TOKEN - Enable Claude Code CLI

💡 To add secrets in GitHub Codespaces:
  1. Go to Settings → Secrets and variables → Codespaces
  2. Add your secret values
  3. Recreate the Codespace for changes to take effect

🚀 Quick commands:
  npm run dev          - Start the development server
  npm run test         - Run all tests
  npm run test:e2e     - Run E2E tests
  npm run db:studio    - Open Drizzle Studio
  npm run lint         - Lint the code
  npm run format       - Format the code

📡 Available services:
  • Dev Server:     http://localhost:5173
  • PostgreSQL Dev: localhost:5432
  • PostgreSQL Test: localhost:5433
  • Drizzle Studio: http://localhost:5555 (when running)

Happy coding! 🚀
════════════════════════════════════════════════════════════════════════════════
EOF