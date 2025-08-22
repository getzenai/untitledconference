# GitHub Codespaces & Dev Container Setup

This folder contains the configuration for GitHub Codespaces and VS Code Dev Containers, enabling you to develop this SvelteKit application in a consistent, cloud-based environment.

## 🚀 Quick Start with GitHub Codespaces

### Creating a New Codespace

1. **From GitHub.com:**

   - Navigate to your repository
   - Click the green "Code" button
   - Select the "Codespaces" tab
   - Click "Create codespace on main" (or your desired branch)

2. **From VS Code:**
   - Install the "GitHub Codespaces" extension
   - Open Command Palette (Cmd/Ctrl + Shift + P)
   - Run "Codespaces: Create New Codespace"
   - Select this repository

### Working with Multiple Codespaces

You can create multiple Codespaces for parallel development:

1. **Creating Branch-Specific Codespaces:**

   ```bash
   # From GitHub.com, select a different branch before creating
   # Or use GitHub CLI:
   gh codespace create -r your-username/sveltekit-vibe-starter -b feature-branch
   ```

2. **Managing Codespaces:**

   - View all: https://github.com/codespaces
   - Stop unused Codespaces to save on usage
   - Delete old Codespaces you're done with

3. **Switching Between Codespaces:**
   - Each Codespace maintains its own state
   - Perfect for working on multiple issues simultaneously
   - Use VS Code or github.dev to connect to different Codespaces

## 🔧 What's Included

### Pre-configured Services

- **PostgreSQL Dev Database** (port 5432)
- **PostgreSQL Test Database** (port 5433)
- **Node.js 20** with npm
- **Git & GitHub CLI**
- **Claude Code CLI** (pre-installed)
- **Docker-in-Docker** support

### VS Code Extensions

- Svelte language support
- Prettier & ESLint
- Tailwind CSS IntelliSense
- Playwright Test Runner
- Vitest Test Explorer

### Automatic Setup

When you create a new Codespace, it automatically:

1. Installs all npm dependencies
2. Sets up PostgreSQL databases
3. Creates `.env` files from examples
4. Runs database migrations
5. Installs Playwright browsers
6. Installs Claude Code CLI
7. Configures Git settings

## 🤖 Working with Claude Code

Claude Code CLI is pre-installed in every Codespace. To use it:

### Setup Claude Code Authentication

1. **Generate Token Locally:**

   ```bash
   # On your local machine
   claude setup-token
   ```

2. **Add Token to GitHub Secrets:**

   - Copy the generated token
   - Go to [your Settings → Codespaces](https://github.com/settings/codespaces/secrets/new)
   - Add new secret: `CLAUDE_CODE_OAUTH_TOKEN`
   - Paste your token value

3. **Using Claude Code in Codespace:**
   ```bash
   # The token is automatically loaded from secrets
   claude-code
   ```

### Benefits for Parallel Development

- Each Codespace is isolated - perfect for Claude Code working on different features
- No conflicts between parallel development sessions
- Claude Code has full access to the development environment
- Database changes in one Codespace don't affect others

## 🔐 Environment Variables & Secrets

### Setting Repository Secrets

1. Go to Settings → Secrets and variables → Codespaces
2. Add required secret:
   - `CLAUDE_CODE_OAUTH_TOKEN` - Generate with `claude setup-token` on your local machine (REQUIRED for Claude Code)
3. Add optional secrets (only if using GitHub OAuth):
   - `GITHUB_CLIENT_ID` - Only needed to enable "Sign in with GitHub" button
   - `GITHUB_CLIENT_SECRET` - Only needed to enable "Sign in with GitHub" button

**Note:** `BETTER_AUTH_SECRET` has a default value for dev environments. Change it in production deployments.

### Local Dev Container

For local VS Code Dev Containers:

1. **Create a `.env` file** in the project root:

   ```bash
   # Required (defaults provided for dev)
   DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"
   BETTER_AUTH_SECRET="dev_local_secret_change_in_production"
   BETTER_AUTH_URL="http://localhost:5173"

   # Optional - GitHub OAuth (only if you want GitHub sign-in)
   GITHUB_CLIENT_ID="your_github_client_id"
   GITHUB_CLIENT_SECRET="your_github_client_secret"

   # Optional - Claude Code CLI
   CLAUDE_CODE_OAUTH_TOKEN="your_claude_token"
   ```

2. **Open in Dev Container** - VS Code will automatically use these values
3. **Never commit `.env` files** - Already in .gitignore for safety

**Note:** The post-create script automatically creates `.env` with default dev values if it doesn't exist, so you only need to add this file if you want to customize the secrets (e.g., add GitHub OAuth or Claude Code token).

## 🛠️ Customization

### Modifying the Dev Container

Edit `.devcontainer/devcontainer.json` to:

- Add VS Code extensions
- Change Node.js version
- Add more Dev Container features
- Configure port forwarding

### Adding Services

Edit `.devcontainer/docker-compose.yml` to add:

- Redis
- Elasticsearch
- Additional databases
- Other services

### Post-Create Scripts

Modify `.devcontainer/post-create.sh` to:

- Install additional tools
- Configure services
- Set up test data
- Run custom initialization

### Port Forwarding Issues

- Ports are automatically forwarded
- Check "Ports" panel in VS Code
- Ensure port visibility is set correctly

## 📚 Additional Resources

- [GitHub Codespaces Docs](https://docs.github.com/en/codespaces)
- [Dev Containers Specification](https://containers.dev/)
- [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers)
- [Managing Codespaces](https://docs.github.com/en/codespaces/managing-codespaces-for-your-organization)
