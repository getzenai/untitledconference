# Initial Resource Setup

One-time setup to create all Azure resources for the SvelteKit app.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- An Azure subscription
- Logged in: `az login`

## Resource Creation Order

Scripts must run in this exact order — each depends on the previous:

```
1. ./setup-keyvault.sh        → Resource Group + Key Vault (everything depends on this)
2. ./setup-db.sh              → PostgreSQL Flexible Server, stores DATABASE_URL in KV
3. ./setup-acr.sh             → Container Registry (needed for image builds)
4. ./setup-container-app.sh   → Container App + Managed Identity + RBAC wiring
5. ./setup-blob-storage.sh    → Blob Storage (optional, for file uploads)
6. ./deploy.sh                → Builds image via ACR + deploys to Container App
```

Run from the `scripts/azure-managed-setup/` directory.

## What Each Script Does

### 1. `setup-keyvault.sh`

**Creates:** Resource Group, Key Vault (RBAC-enabled)

**Secrets stored:**

- `better-auth-secret` — auto-generated via `openssl rand -base64 32`
- `github-client-id`, `github-client-secret` — prompted interactively (optional)
- `sendgrid-api-key`, `sendgrid-from` — prompted interactively (optional)
- `azure-openai-api-key`, `azure-resource-name`, `azure-openai-deployment-name` — prompted interactively (optional)

**RBAC:** Grants the current user temporary `Key Vault Secrets Officer` for writing secrets, then downgrades to `Key Vault Secrets User` (read-only).

**Idempotent:** Re-running prompts for secrets again (existing secrets are overwritten if you enter a new value, skipped if you press Enter).

### 2. `setup-db.sh`

**Creates:** PostgreSQL Flexible Server (Burstable B1ms, PG16, 32GB storage), database, firewall rules

**Secrets stored:** `database-url` — composed from auto-generated admin credentials, stored in KV, never printed

**Firewall rules:**

- `AllowAllForDev` (0.0.0.0 - 255.255.255.255) — open for dev access
- `AllowAzureServices` (0.0.0.0 - 0.0.0.0) — allows Azure-internal traffic

**Idempotent:** Skips password + KV update if both server and secret exist. Use `--rotate-password` to force credential rotation.

**Note:** Server creation takes ~5 minutes on first run.

### 3. `setup-acr.sh`

**Creates:** Container Registry (Basic SKU)

**Note:** ACR names must be alphanumeric only (Azure constraint). The name is derived as `{APP_NAME}acr{ENV}` with hyphens stripped.

### 4. `setup-container-app.sh`

**Creates:** Container Apps Environment (Consumption plan), Container App with system-assigned Managed Identity

**RBAC:** Grants the Container App's Managed Identity `Key Vault Secrets User` role on the KV.

**Secret wiring:** Creates Key Vault secret references on the Container App, then maps them to environment variables:

| KV Secret                      | Container App Env Var          | Wired As                                             |
| ------------------------------ | ------------------------------ | ---------------------------------------------------- |
| `database-url`                 | `DATABASE_URL`                 | `secretref:database-url`                             |
| `better-auth-secret`           | `BETTER_AUTH_SECRET`           | `secretref:better-auth-secret`                       |
| `github-client-id`             | `GITHUB_CLIENT_ID`             | `secretref:github-client-id` (if exists)             |
| `github-client-secret`         | `GITHUB_CLIENT_SECRET`         | `secretref:github-client-secret` (if exists)         |
| `sendgrid-api-key`             | `SENDGRID_API_KEY`             | `secretref:sendgrid-api-key` (if exists)             |
| `sendgrid-from`                | `SENDGRID_FROM`                | `secretref:sendgrid-from` (if exists)                |
| `azure-openai-api-key`         | `AZURE_OPENAI_API_KEY`         | `secretref:azure-openai-api-key` (if exists)         |
| `azure-resource-name`          | `AZURE_RESOURCE_NAME`          | `secretref:azure-resource-name` (if exists)          |
| `azure-openai-deployment-name` | `AZURE_OPENAI_DEPLOYMENT_NAME` | `secretref:azure-openai-deployment-name` (if exists) |

Also derives feature flags: `SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG=true` if SendGrid secrets exist, `AI_PROVIDER=azure` if Azure OpenAI secrets exist.

**Hardcoded env vars:** `NODE_ENV=production`, `PORT=3000`, `LOG_LEVEL=warn`, `LOG_FORMAT=json`

### 5. `setup-blob-storage.sh` (optional)

**Creates:** Storage Account (Standard_LRS, Hot tier), `uploads` blob container (private)

**RBAC:** Grants the Container App's MI `Storage Blob Data Contributor` role. Sets `BLOB_STORAGE_URL` env var on the Container App.

### 6. `deploy.sh`

See [03-dev-deployment.md](./03-dev-deployment.md).

## Naming Convention

All resource names are derived from `APP_NAME` and `ENVIRONMENT` in `_vars.sh`:

| Resource          | Pattern                           | Example                |
| ----------------- | --------------------------------- | ---------------------- |
| Resource Group    | `rg-{APP_NAME}-{ENV}`             | `rg-vibe-starter-dev`  |
| DB Server         | `{APP_NAME}-db-{ENV}`             | `vibe-starter-db-dev`  |
| DB Name           | `{APP_NAME}` (underscores)        | `vibe_starter`         |
| Key Vault         | `{APP_NAME}-kv-{ENV}`             | `vibe-starter-kv-dev`  |
| ACR               | `{APP_NAME}acr{ENV}` (no hyphens) | `vibestarteracrdev`    |
| Container App Env | `{APP_NAME}-env-{ENV}`            | `vibe-starter-env-dev` |
| Container App     | `{APP_NAME}-app-{ENV}`            | `vibe-starter-app-dev` |
| Storage           | `{APP_NAME}st{ENV}` (no hyphens)  | `vibestarterstdev`     |

**Customization:** Change `APP_NAME` in `_vars.sh` or set as env var: `APP_NAME=myapp ./setup-keyvault.sh`

## Checking Status

Run `./overview.sh` at any time to see the state of all resources. This is read-only and changes nothing. It shows:

- Resource Group and all resources within it
- PostgreSQL server state, version, SKU, databases, firewall rules
- Key Vault URI and secret names (never values)
- ACR repositories and recent image tags
- Container App URL, image, and Managed Identity
- Blob Storage endpoint and containers

## Credential Security

**Threat model:** Coding agents run scripts and see all terminal output. Credentials must never be exposed.

| Rule                                         | How                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| No credentials in terminal output            | Scripts never `echo` passwords, tokens, connection strings, or API keys                    |
| No credentials on local filesystem           | No `.env` files with production secrets. All secrets go directly to Key Vault              |
| No interactive prompts for essential secrets | `DATABASE_URL` and `BETTER_AUTH_SECRET` are auto-generated. Only optional keys use prompts |
| Variables unset after use                    | `unset ADMIN_PASSWORD DATABASE_URL` immediately after storing in KV                        |
| No password rotation on re-run               | `setup-db.sh` skips when server + secret exist. Use `--rotate-password` to force           |
| overview.sh never shows secret values        | Only lists secret names, never retrieves values                                            |
