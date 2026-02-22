# Deploying to Dev Resources

How to build and deploy the SvelteKit app to Azure Container Apps.

## Prerequisites

- All setup scripts completed ([01-initial-setup.md](./01-initial-setup.md))
- Azure CLI logged in (`az login`)

## Deploy

```bash
./scripts/azure-managed-setup/deploy.sh           # deploys with tag "latest"
./scripts/azure-managed-setup/deploy.sh v1.2.3    # deploys with custom tag
```

## What Happens During Deploy

### Step 1: Server-side Image Build

```
deploy.sh → az acr build → ACR builds Docker image on Azure servers
```

The image is built **on Azure** using `az acr build`, not locally. No local Docker daemon is needed. The entire `Dockerfile` multi-stage build runs on ACR infrastructure:

1. Builder stage: `npm ci` + `npm run build` (produces SvelteKit Node.js bundle)
2. Runtime stage: Copies build output + production deps into a minimal image
3. Image is tagged and pushed to ACR: `vibestarteracrdev.azurecr.io/vibe-starter:latest`

### Step 2: Container App Update

```
deploy.sh → az containerapp update → Container App pulls new image from ACR
```

If the Container App exists, it's updated to use the new image. The app restarts with the new code while keeping all existing environment variables and secret references intact.

## How Secrets Reach the App

The Container App does **not** store any secrets directly. Instead:

```
Key Vault secrets
    ↓ (Managed Identity + RBAC)
Container App secret references (keyvaultref)
    ↓ (secretref mapping)
Environment variables (DATABASE_URL, BETTER_AUTH_SECRET, etc.)
    ↓
SvelteKit config.ts reads process.env
```

This wiring is set up by `setup-container-app.sh` and persists across deployments. You only need to re-run `setup-container-app.sh` if you add new secrets to Key Vault.

## Adding New Secrets

If you add a new secret to Key Vault after the initial setup:

1. Store the secret in KV: re-run `./setup-keyvault.sh` (interactive prompts)
2. Re-wire the Container App: re-run `./setup-container-app.sh` (picks up new KV secrets automatically)
3. Re-deploy: `./deploy.sh` (the app needs to restart to pick up new env vars)

## Database Schema Updates

Before deploying code that changes the database schema, push the schema first:

```bash
npm run db:push
```

This runs Drizzle Kit with the Azure `DATABASE_URL` from Key Vault.

## Checking the Deployment

### App URL

After a successful deploy, the script prints the app URL:

```
URL: https://vibe-starter-app-dev.<region>.azurecontainerapps.io
```

### Resource Status

```bash
./scripts/azure-managed-setup/overview.sh
```

Shows the current image tag, Container App status, and all resource states.

### Container App Logs

```bash
az containerapp logs show --name vibe-starter-app-dev \
    --resource-group rg-vibe-starter-dev --type console --follow
```

## Rollback

To deploy a previous version:

```bash
./scripts/azure-managed-setup/deploy.sh v1.0.0    # re-deploys a previous tag
```

Note: This rebuilds the image from the current code. For true rollback to a previously-built image, use:

```bash
az containerapp update --name vibe-starter-app-dev \
    --resource-group rg-vibe-starter-dev \
    --image vibestarteracrdev.azurecr.io/vibe-starter:v1.0.0
```
