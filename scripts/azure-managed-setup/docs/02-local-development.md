# Local Development

All credentials (API keys, auth secrets) come from Azure Key Vault. The `dev-from-kv.sh` script fetches secrets, exports them as environment variables (in memory only), and runs the dev server.

Two development modes are supported — both require `az login`.

## Prerequisites

1. Azure CLI installed and logged in (`az login`)
2. Initial setup completed ([01-initial-setup.md](./01-initial-setup.md)) — at minimum `setup-keyvault.sh` + `setup-db.sh`
3. Your Azure AD identity needs `Key Vault Secrets User` role (granted automatically by `setup-keyvault.sh`)
4. Docker (only for Local Docker mode)

## Azure DB Mode (default)

No `.env` file needed. All values come from Key Vault:

```bash
npm run dev
```

## Local Docker Mode

Uses local Docker PostgreSQL for databases, Key Vault for everything else:

```bash
docker compose up -d           # start dev-db (port 5432) + test-db (port 5433)
cp .env.example .env           # uncomment DATABASE_URL and TEST_DATABASE_URL
npm run dev                    # .env DB URLs used, rest from KV
```

## How It Works

`npm run dev` calls `dev-from-kv.sh` which:

1. Sources `.env` if present (picks up local Docker DB URLs)
2. For each KV secret: **skips fetch if env var is already set** (from `.env`)
3. Derives feature flags from available secrets
4. Runs `npm run dev:vite`

This means `.env` values take precedence over KV for the same variable. Use this to override DATABASE_URL/TEST_DATABASE_URL with local Docker connection strings.

## Running Other Commands with KV Secrets

`dev-from-kv.sh` accepts any command as arguments:

```bash
./scripts/azure-managed-setup/dev-from-kv.sh npm run build
./scripts/azure-managed-setup/dev-from-kv.sh npx drizzle-kit push
./scripts/azure-managed-setup/dev-from-kv.sh npx drizzle-kit studio
```

npm aliases:

```bash
npm run db:push        # push schema to database
npm run db:studio      # open Drizzle Studio
npm run db:push:test   # push schema to test database
```

## Secret Mapping

`dev-from-kv.sh` fetches secrets from KV and maps them to env vars:

| KV Secret Name                 | Env Var                        | Required |
| ------------------------------ | ------------------------------ | -------- |
| `database-url`                 | `DATABASE_URL`                 | Yes      |
| `test-database-url`            | `TEST_DATABASE_URL`            | No       |
| `better-auth-secret`           | `BETTER_AUTH_SECRET`           | Yes      |
| `github-client-id`             | `GITHUB_CLIENT_ID`             | No       |
| `github-client-secret`         | `GITHUB_CLIENT_SECRET`         | No       |
| `sendgrid-api-key`             | `SENDGRID_API_KEY`             | No       |
| `sendgrid-from`                | `SENDGRID_FROM`                | No       |
| `azure-openai-api-key`         | `AZURE_OPENAI_API_KEY`         | No       |
| `azure-resource-name`          | `AZURE_RESOURCE_NAME`          | No       |
| `azure-openai-deployment-name` | `AZURE_OPENAI_DEPLOYMENT_NAME` | No       |

If a required secret is missing and not set in `.env`/environment, the script fails with a clear error.

## Non-Secret Configuration

These values are set directly by the script (not from KV). Override via env vars if needed:

| Env Var                       | Default                     | Override Example                  |
| ----------------------------- | --------------------------- | --------------------------------- |
| `BETTER_AUTH_URL`             | `http://localhost:5173`     | `BETTER_AUTH_URL=... npm run dev` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `http://localhost:5173,...` | —                                 |
| `LOG_LEVEL`                   | `warn`                      | `LOG_LEVEL=debug npm run dev`     |
| `LOG_FORMAT`                  | `human`                     | —                                 |

## Feature Flag Derivation

The script automatically derives feature flags from available secrets:

- **`SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG`** — set to `true` if both `SENDGRID_API_KEY` and `SENDGRID_FROM` exist in KV, otherwise `false`
- **`AI_PROVIDER`** — set to `azure` if all three Azure OpenAI secrets exist, otherwise `mock`. Warns if only partial config is found

Override manually if needed: `AI_PROVIDER=mock npm run dev`

## How It Works (No Secrets on Disk)

`dev-from-kv.sh` never writes secrets to disk. The flow is:

```
.env (DB URLs only, optional) → Azure Key Vault → az CLI → shell env vars (memory only) → exec dev server
```

When the process ends, the variables are gone. The `.env` file only contains non-sensitive local Docker connection strings.

## Troubleshooting

**`Not logged in. Run 'az login' first.`**
Run `az login` to authenticate with Azure. The script requires a valid Azure CLI session.

**`Required secret 'database-url' not found`**
Run `./setup-keyvault.sh` then `./setup-db.sh` to create the Key Vault and database. Or set `DATABASE_URL` in `.env` for local Docker mode.

**`Required secret 'better-auth-secret' not found`**
Run `./setup-keyvault.sh` — this auto-generates the secret.

**Connection refused to Azure DB**
Check that the Azure PostgreSQL firewall allows your IP. The dev setup uses `AllowAllForDev` (0.0.0.0-255.255.255.255) which should allow any IP.
