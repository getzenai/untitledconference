# Local Development

All secrets live in Azure Key Vault — no `.env` files for credentials. The `dev-from-kv.sh` script fetches secrets from KV, exports them as environment variables (in memory only), and runs the dev server.

## Prerequisites

1. Azure CLI installed and logged in (`az login`)
2. Initial setup completed ([01-initial-setup.md](./01-initial-setup.md)) — at minimum `setup-keyvault.sh` + `setup-db.sh`
3. Docker running (for the local test database)
4. Your Azure AD identity needs `Key Vault Secrets User` role (granted automatically by `setup-keyvault.sh`)

## Daily Workflow

```bash
docker compose up -d                              # start test DB (for E2E/integration tests)
./scripts/azure-managed-setup/dev-from-kv.sh      # fetch KV secrets + start dev server
```

Or use the npm alias:

```bash
npm run dev:azure
```

The dev server starts at `http://localhost:5173` and connects to the Azure PostgreSQL database.

## Running Other Commands with KV Secrets

`dev-from-kv.sh` accepts any command as arguments:

```bash
./scripts/azure-managed-setup/dev-from-kv.sh npm run build
./scripts/azure-managed-setup/dev-from-kv.sh npx drizzle-kit push
./scripts/azure-managed-setup/dev-from-kv.sh npx drizzle-kit studio
```

npm aliases:

```bash
npm run db:push:azure      # push schema to Azure DB
npm run db:studio:azure    # open Drizzle Studio with Azure DB
```

## Secret Mapping

`dev-from-kv.sh` fetches secrets from KV and maps them to env vars:

| KV Secret Name                 | Env Var                        | Required |
| ------------------------------ | ------------------------------ | -------- |
| `database-url`                 | `DATABASE_URL`                 | Yes      |
| `better-auth-secret`           | `BETTER_AUTH_SECRET`           | Yes      |
| `github-client-id`             | `GITHUB_CLIENT_ID`             | No       |
| `github-client-secret`         | `GITHUB_CLIENT_SECRET`         | No       |
| `sendgrid-api-key`             | `SENDGRID_API_KEY`             | No       |
| `sendgrid-from`                | `SENDGRID_FROM`                | No       |
| `azure-openai-api-key`         | `AZURE_OPENAI_API_KEY`         | No       |
| `azure-resource-name`          | `AZURE_RESOURCE_NAME`          | No       |
| `azure-openai-deployment-name` | `AZURE_OPENAI_DEPLOYMENT_NAME` | No       |

If a required secret is missing, the script fails with a clear error pointing to which setup script to run.

## Non-Secret Configuration

These values are set directly by the script (not from KV). Override via env vars if needed:

| Env Var                       | Default                                                | Override Example                                          |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `BETTER_AUTH_URL`             | `http://localhost:5173`                                | `BETTER_AUTH_URL=http://localhost:3000 npm run dev:azure` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `http://localhost:5173,...`                            | —                                                         |
| `LOG_LEVEL`                   | `warn`                                                 | `LOG_LEVEL=debug npm run dev:azure`                       |
| `LOG_FORMAT`                  | `human`                                                | —                                                         |
| `TEST_DATABASE_URL`           | `postgres://root:mysecretpassword@localhost:5433/test` | —                                                         |

## Feature Flag Derivation

The script automatically derives feature flags from available secrets:

- **`SEND_EMAILS_INSTEAD_OF_CONSOLE_LOG`** — set to `true` if both `SENDGRID_API_KEY` and `SENDGRID_FROM` exist in KV, otherwise `false`
- **`AI_PROVIDER`** — set to `azure` if all three Azure OpenAI secrets exist (`AZURE_OPENAI_API_KEY`, `AZURE_RESOURCE_NAME`, `AZURE_OPENAI_DEPLOYMENT_NAME`), otherwise `mock`. Warns if only partial config is found

Override manually if needed: `AI_PROVIDER=mock npm run dev:azure`

## Test Database

Tests use a **local Docker PostgreSQL** on port 5433, not the Azure database. This ensures:

- Fast, disposable test data
- No interference with dev data
- Works offline (no Azure connection needed for tests)

```bash
docker compose up -d     # starts test-db on :5433
npm run test:e2e         # uses TEST_DATABASE_URL (local Docker)
```

## How It Works (No Files on Disk)

`dev-from-kv.sh` never writes secrets to disk. The flow is:

```
Azure Key Vault → az CLI → shell env vars (memory only) → exec npm run dev
```

When the process ends, the variables are gone. No `.env` file is created or modified.

## Troubleshooting

**`Not logged in. Run 'az login' first.`**
Run `az login` to authenticate with Azure. The script requires a valid Azure CLI session.

**`Required secret 'database-url' not found`**
Run `./setup-keyvault.sh` then `./setup-db.sh` to create the Key Vault and database.

**`Required secret 'better-auth-secret' not found`**
Run `./setup-keyvault.sh` — this auto-generates the secret.

**Connection refused to Azure DB**
Check that the Azure PostgreSQL firewall allows your IP. The dev setup uses `AllowAllForDev` (0.0.0.0-255.255.255.255) which should allow any IP.

**Old `.env` file still present**
If you have a legacy `.env` file with secrets, Vite will load it — but env vars from `dev-from-kv.sh` take precedence. For cleanliness, delete the old `.env` or remove secret values from it.
