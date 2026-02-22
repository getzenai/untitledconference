#!/bin/bash
set -e

echo "Starting SvelteKit Vibe Starter workspace setup..."

# Load nvm if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
fi

# Check Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js LTS first"
    exit 1
fi

# Switch to Node 22 via nvm if available
if command -v nvm &> /dev/null; then
    echo "Switching to Node.js 22 via nvm..."
    nvm use 22 || {
        echo "Warning: Could not switch to Node 22, using current Node version: $(node -v)"
    }
else
    echo "Using Node.js version: $(node -v)"
fi

# Check Azure CLI login (required for Key Vault access)
if ! command -v az &> /dev/null; then
    echo "Error: Azure CLI (az) is not installed"
    echo "Install it: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

if ! az account show > /dev/null 2>&1; then
    echo "Error: Not logged in to Azure. Run 'az login' first."
    echo "Key Vault access is required for secrets (auth, API keys)."
    exit 1
fi

echo "Azure CLI: logged in as $(az ad signed-in-user show --query userPrincipalName -o tsv 2>/dev/null || echo 'unknown')"

# Sync with remote
echo "Syncing with remote..."
git fetch origin
git rebase origin/main || {
    echo "Warning: Rebase failed — aborting to restore clean state"
    git rebase --abort 2>/dev/null || true
    echo "Continuing with current branch state"
}

# Handle .env for local Docker mode (optional)
if [ -n "${CONDUCTOR_ROOT_PATH:-}" ] && [ -f "$CONDUCTOR_ROOT_PATH/.env" ]; then
    if [ -e .env ] && [ ! -L .env ]; then
        echo "Warning: .env file already exists and is not a symlink. Keeping existing file."
    else
        echo "Creating symlink to .env file from Conductor root..."
        ln -sf "$CONDUCTOR_ROOT_PATH/.env" .env
    fi
    echo "Local Docker mode: DATABASE_URL from .env, secrets from Key Vault"
else
    echo "Azure DB mode: all values from Key Vault (no .env needed)"
fi

# Install dependencies
echo "Installing npm dependencies..."
npm install || {
    echo "Error: npm install failed"
    exit 1
}

# Push database schema via dev-from-kv.sh (works in both modes)
echo "Pushing database schema..."
./scripts/azure-managed-setup/dev-from-kv.sh npx drizzle-kit push --force || {
    echo "Error: Failed to push database schema"
    echo "Check Azure CLI login and Key Vault access."
    exit 1
}

echo "Workspace setup complete!"
echo ""
echo "Next steps:"
echo "  - Click 'Run' to start the dev server"
echo "  - The app will be available at http://localhost:5173"
