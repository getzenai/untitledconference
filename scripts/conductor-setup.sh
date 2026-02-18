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

# Validate CONDUCTOR_ROOT_PATH
if [ -z "$CONDUCTOR_ROOT_PATH" ]; then
    echo "Error: CONDUCTOR_ROOT_PATH not set"
    echo "Please configure your .env file in Conductor settings"
    exit 1
fi

# Validate .env exists at root
if [ ! -f "$CONDUCTOR_ROOT_PATH/.env" ]; then
    echo "Error: No .env file found at $CONDUCTOR_ROOT_PATH/.env"
    echo "Please configure your .env file in Conductor settings"
    exit 1
fi

# Sync with remote
echo "Syncing with remote..."
git fetch origin
git rebase origin/main || {
    echo "Warning: Rebase failed — aborting to restore clean state"
    git rebase --abort 2>/dev/null || true
    echo "Continuing with current branch state"
}

# Check for existing non-symlink .env (prevent overwriting real config)
if [ -e .env ] && [ ! -L .env ]; then
    echo "Error: .env file already exists and is not a symlink."
    echo "Remove it manually before running setup."
    exit 1
fi

# Create .env symlink
echo "Creating symlink to .env file from Conductor root..."
ln -sf "$CONDUCTOR_ROOT_PATH/.env" .env

# Install dependencies
echo "Installing npm dependencies..."
npm install || {
    echo "Error: npm install failed"
    exit 1
}

# Warn if database containers are not running
if command -v docker &> /dev/null; then
    if ! docker ps --format '{{.Names}}' | grep -q 'postgres-vibe-starter$'; then
        echo "Warning: Database container 'postgres-vibe-starter' not detected"
        echo "Make sure Docker containers are running: npm run db:start"
    fi
else
    echo "Warning: Docker not found. Ensure database containers are running."
fi

# Push database schema
echo "Pushing database schema..."
npm run db:push:force || {
    echo "Error: Failed to push database schema"
    echo "Make sure your DATABASE_URL is configured correctly in .env"
    echo "and Docker containers are running (npm run db:start)"
    exit 1
}

echo "Workspace setup complete!"
echo ""
echo "Next steps:"
echo "  - Click 'Run' to start the dev server"
echo "  - The app will be available at http://localhost:5173"
