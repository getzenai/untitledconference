# Azure Managed Setup

Azure Container Apps deployment for SvelteKit Vibe Starter.

## Architecture

![Architecture](./architecture.png)

_Source: [architecture.puml](./architecture.puml)_

```
rg-vibe-starter-dev (germanywestcentral / Frankfurt)
├── vibe-starter-db-dev      PostgreSQL Flexible Server (Burstable B1ms, PG16)
│   └── vibe_starter         Database
├── vibe-starter-kv-dev      Key Vault (RBAC-enabled)
│   ├── database-url         Secret
│   ├── better-auth-secret   Secret
│   └── sendgrid-api-key     Secret (optional)
├── vibestarteracrdev        Container Registry (Basic)
│   └── vibe-starter:latest  Docker image
├── vibe-starter-env-dev     Container Apps Environment (Consumption)
│   └── vibe-starter-app-dev Container App (Node.js, port 3000)
│       └── System MI → KV Secrets User + ACR Pull + Storage Blob Contributor
└── vibestarterstdev          Storage Account (optional)
    └── uploads              Blob container
```

SvelteKit with `adapter-node` is a single Node.js server (SSR + API + static assets). Only one Container App needed — no separate frontend deployment.

## Setup Order

Scripts must run in this order due to dependencies:

```
1. ./setup-keyvault.sh        → creates RG + KV (must be first)
2. ./setup-db.sh              → creates PostgreSQL, stores DATABASE_URL in KV
3. ./setup-acr.sh             → creates container registry
4. ./setup-container-app.sh   → creates app + MI + RBAC (needs KV + ACR)
5. ./setup-blob-storage.sh    → optional, creates storage + MI RBAC
6. ./deploy.sh                → builds + deploys the app
```

Run `./overview.sh` to check the status of all resources.

## Naming Convention

All resource names are derived from `APP_NAME` and `ENVIRONMENT` in `_vars.sh`:

| Variable          | Pattern                           | Example                |
| ----------------- | --------------------------------- | ---------------------- |
| Resource Group    | `rg-{APP_NAME}-{ENV}`             | `rg-vibe-starter-dev`  |
| DB Server         | `{APP_NAME}-db-{ENV}`             | `vibe-starter-db-dev`  |
| DB Name           | `{APP_NAME}` (underscores)        | `vibe_starter`         |
| Key Vault         | `{APP_NAME}-kv-{ENV}`             | `vibe-starter-kv-dev`  |
| ACR               | `{APP_NAME}acr{ENV}` (no hyphens) | `vibestarteracrdev`    |
| Container App Env | `{APP_NAME}-env-{ENV}`            | `vibe-starter-env-dev` |
| Container App     | `{APP_NAME}-app-{ENV}`            | `vibe-starter-app-dev` |
| Storage           | `{APP_NAME}st{ENV}` (no hyphens)  | `vibestarterstdev`     |

To customize per project, change `APP_NAME` in `_vars.sh` or set it as an env var.

## Design Principles

- **Idempotent scripts** — every script can be run multiple times safely. Resources are checked before creation. Password rotation requires explicit `--rotate-password` flag.
- **Key Vault as single source of truth** — all secrets live in Key Vault. The Container App receives them as env vars via Key Vault secret references.
- **Managed Identity for auth** — no credentials stored on the Container App. RBAC roles grant access to KV, ACR, and Blob Storage.
- **Server-side Docker builds** — `deploy.sh` uses `az acr build` (builds on Azure, not locally). No local Docker daemon required.
- **Least privilege RBAC** — setup user gets temporary write access during setup, then downgraded to read-only.
- **Infrastructure-agnostic app** — the SvelteKit app reads secrets from `process.env` via a centralized config module (`$lib/server/config.ts`). It has zero awareness of Azure, KV, or any cloud provider. The infrastructure layer (these scripts) injects secrets as env vars.

## Credential Security

**Threat model:** Coding agents run scripts and see all terminal output. Credentials must never be exposed.

### Rules

| Rule                                         | How                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No credentials in terminal output            | Scripts never `echo` passwords, tokens, connection strings, or API keys                                                            |
| No credentials on local filesystem           | No `.env` files with production secrets. All secrets go directly to Key Vault                                                      |
| No interactive prompts for essential secrets | `DATABASE_URL` and `BETTER_AUTH_SECRET` are auto-generated and stored in KV. Only optional keys (SendGrid) use interactive prompts |
| Variables unset after use                    | `unset ADMIN_PASSWORD DATABASE_URL` after storing in KV                                                                            |
| No password rotation on re-run               | `setup-db.sh` skips password changes when server + KV secret already exist. Use `--rotate-password` for intentional rotation       |
| overview.sh never shows secret values        | Only lists secret names, never retrieves values                                                                                    |

### Credential Flow

```
setup-keyvault.sh
  ├─ auto-generates BETTER_AUTH_SECRET → stores in KV (never printed)
  └─ prompts for SENDGRID_API_KEY (optional, interactive terminal only)

setup-db.sh
  ├─ auto-generates DB admin password → variable only (first run only)
  ├─ creates PostgreSQL server with that password
  ├─ composes DATABASE_URL → stores in KV (never printed)
  ├─ unsets password + URL variables
  └─ on re-run: skips password + KV if both exist (use --rotate-password to force)

setup-container-app.sh
  ├─ creates Key Vault secret references via Managed Identity
  │   ├─ database-url      → keyvaultref (required)
  │   ├─ better-auth-secret → keyvaultref (required)
  │   ├─ sendgrid-api-key   → keyvaultref (if exists in KV)
  │   └─ sendgrid-from      → keyvaultref (if exists in KV)
  └─ maps secrets to env vars via secretref:
      ├─ DATABASE_URL=secretref:database-url
      ├─ BETTER_AUTH_SECRET=secretref:better-auth-secret
      ├─ BETTER_AUTH_URL=https://<app-fqdn> (plain env var)
      └─ SENDGRID_API_KEY, SENDGRID_FROM (if configured)

The app receives secrets as regular env vars — no Azure SDK or KV client needed.
```

### App Config Module

The app centralizes all env var access in `src/lib/server/config.ts`:

- Declares all required and optional env vars with types
- Validates required vars eagerly at server startup (fail fast)
- All server modules import from `config` instead of `$env/dynamic/private` directly
- 100% infrastructure-agnostic — works with any platform that injects env vars

### What agents CAN see

- Resource names, hostnames, FQDNs
- Azure resource IDs and subscription info
- Status messages ("Key Vault created", "Credentials stored in Key Vault")
- Container App URL
- Secret _names_ (not values)

### What agents will NEVER see

- Database passwords or `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `SENDGRID_API_KEY`
- Any Key Vault secret values
