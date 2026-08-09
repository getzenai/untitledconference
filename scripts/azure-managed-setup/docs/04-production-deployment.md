# Production Deployment (Anticipated)

The production environment does not exist yet. This document describes the anticipated approach using the same script set with a different `ENVIRONMENT` value.

## Approach

The same setup scripts work for any environment. Production uses `ENVIRONMENT=prod`, which creates a completely separate set of resources:

```bash
ENVIRONMENT=prod ./setup-keyvault.sh
ENVIRONMENT=prod ./setup-db.sh
ENVIRONMENT=prod ./setup-acr.sh
ENVIRONMENT=prod ./setup-container-app.sh
ENVIRONMENT=prod ./deploy.sh
```

This creates:

```
rg-vibe-starter-prod
├── vibe-starter-db-prod        PostgreSQL Flexible Server
├── vibe-starter-kv-prod        Key Vault (separate secrets from dev)
├── vibestarteracrprod          Container Registry
├── vibe-starter-env-prod       Container Apps Environment
│   └── vibe-starter-app-prod   Container App
└── vibestarterstprod            Storage Account (optional)
```

## Production-Specific Considerations

### Database

- **Firewall:** Remove `AllowAllForDev` rule. Keep only `AllowAzureServices` so only the Container App can reach the database. This requires modifying `setup-db.sh` or adding a `--production` flag that skips the wide-open firewall rule.
- **SKU:** Consider upgrading from `Standard_B1ms` (Burstable) to a General Purpose tier for consistent performance.
- **Backups:** Azure Flexible Server includes automatic backups (7-day retention by default). Consider increasing retention for production.
- **Connection pooling:** For higher traffic, consider PgBouncer (built into Azure Flexible Server).

### Container App

- **Replicas:** Increase `--min-replicas` from 1 to at least 2 for high availability.
- **Resources:** Increase CPU/memory from 0.5 CPU / 1GB based on load testing.
- **Custom domain:** Add a custom domain with managed TLS certificate:
  ```bash
  az containerapp hostname add --name vibe-starter-app-prod \
      -g rg-vibe-starter-prod --hostname app.yourdomain.com
  az containerapp hostname bind --name vibe-starter-app-prod \
      -g rg-vibe-starter-prod --hostname app.yourdomain.com \
      --environment vibe-starter-env-prod --validation-method CNAME
  ```
- **`BETTER_AUTH_URL`:** Must be set to the production domain (e.g., `https://app.yourdomain.com`) instead of the auto-generated Azure FQDN if using a custom domain.

### Secrets

- **Separate Key Vault:** `vibe-starter-kv-prod` has its own secrets, completely independent from dev.
- **GitHub OAuth:** Production OAuth app has different redirect URIs pointing to the production domain.
- **BETTER_AUTH_SECRET:** Auto-generated separately for prod — sessions from dev won't work in prod (by design).
- **SendGrid:** Production may use a different sender domain.

### CI/CD Pipeline

The anticipated deployment flow via GitHub Actions:

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy to Production
on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: ENVIRONMENT=prod ./scripts/azure-managed-setup/deploy.sh ${{ github.ref_name }}
```

**`AZURE_CREDENTIALS`** is a service principal with:

- `AcrPush` role on the ACR (to push images)
- `Contributor` role on the Container App (to update it)

Create with:

```bash
az ad sp create-for-rbac --name "github-deploy-prod" \
    --role Contributor \
    --scopes /subscriptions/<sub-id>/resourceGroups/rg-vibe-starter-prod
```

### Environment Separation

| Aspect                 | Dev                    | Prod                          |
| ---------------------- | ---------------------- | ----------------------------- |
| Resource Group         | `rg-vibe-starter-dev`  | `rg-vibe-starter-prod`        |
| DB Firewall            | Open to all IPs        | Azure services only           |
| DB SKU                 | Burstable B1ms         | General Purpose (recommended) |
| Container App Replicas | 1-3                    | 2-5+                          |
| Key Vault              | `vibe-starter-kv-dev`  | `vibe-starter-kv-prod`        |
| BETTER_AUTH_URL        | Auto-generated FQDN    | Custom domain                 |
| Deploy trigger         | Manual (`./deploy.sh`) | Git tag push via CI/CD        |
| LOG_FORMAT             | `human` or `json`      | `json`                        |

## TODO Before Going to Production

- [ ] Create production Azure resources: `ENVIRONMENT=prod ./setup-keyvault.sh` etc.
- [ ] Restrict DB firewall (remove AllowAllForDev rule or add `--production` flag to `setup-db.sh`)
- [ ] Set up custom domain and TLS on Container App
- [ ] Create production GitHub OAuth app with correct redirect URIs
- [ ] Create Azure service principal for CI/CD
- [ ] Set up GitHub Actions workflow for automated deploys
- [ ] Configure monitoring and alerts (Azure Monitor / Application Insights)
- [ ] Review and increase DB SKU and Container App resources based on expected load
- [ ] Set up log aggregation (Container App → Log Analytics workspace)
