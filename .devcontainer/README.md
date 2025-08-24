# 🎉 Welcome to SvelteKit Vibe Starter Dev Container!

## 🚀 Quick Start Commands

```bash
npm run dev          # Start the development server
npm run test         # Run all tests
npm run test:e2e     # Run E2E tests
npm run db:studio    # Open Drizzle Studio
npm run lint         # Lint the code
npm run format       # Format the code
```

## 📡 Available Services

**Access from your browser/host:**

- **Dev Server**: http://localhost:5173
- **PostgreSQL Dev**: localhost:5432
- **PostgreSQL Test**: localhost:5433
- **Drizzle Studio**: http://localhost:5555 (when running)

**Database connections in code use Docker service names:**

- **Dev DB**: `postgres://root:mysecretpassword@project-db:5432/local`
- **Test DB**: `postgres://root:mysecretpassword@test-db:5432/test`

## 🔐 Environment Configuration

### Automatic Setup

Environment variables are automatically configured:

- Single `.env` file created from `.devcontainer/.env.devcontainer` template
- `IS_DEVCONTAINER=true` automatically switches database hosts
- Database connections use Docker service names (project-db, test-db)
- Both `DATABASE_URL` and `TEST_DATABASE_URL` are configured
- Authentication secrets have safe defaults for development
- Third-party secrets are pulled from Codespace secrets

### Optional Codespace Secrets

Add these in [GitHub Settings → Codespaces](https://github.com/settings/codespaces):

- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` - Enable "Sign in with GitHub"
- `CLAUDE_CODE_OAUTH_TOKEN` - Enable Claude Code CLI (see setup below)

## 🤖 Setting Up Claude Code

1. **On your local machine**, generate a token:

   ```bash
   claude setup-token
   ```

2. **Add to GitHub Secrets**:

   - Go to [Settings → Codespaces](https://github.com/settings/codespaces/secrets/new)
   - Add secret: `CLAUDE_CODE_OAUTH_TOKEN`
   - Paste your token value
   - Recreate the Codespace for changes to take effect

3. **Use Claude Code**:
   ```bash
   claude-code
   ```

---

# Full Documentation

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

1. **Environment Setup is Automatic** - The `.env` file is created from `.devcontainer/.env.devcontainer` template

2. **To Add Optional Secrets Locally**:

   - Set environment variables before opening the container:
     ```bash
     export GITHUB_CLIENT_ID="your_github_client_id"
     export GITHUB_CLIENT_SECRET="your_github_client_secret"
     export CLAUDE_CODE_OAUTH_TOKEN="your_claude_token"
     ```
   - Or manually edit the generated `.env` file after container creation

3. **Database Connections**:
   - Inside container: Uses Docker service names (`project-db:5432`, `test-db:5432`)
   - From host machine: Uses localhost with mapped ports (`localhost:5432`, `localhost:5433`)

**Note:** The `.env` file is automatically created with proper database URLs for the container environment. Third-party secrets are only needed if you want to enable optional features like GitHub OAuth or Claude Code.

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
