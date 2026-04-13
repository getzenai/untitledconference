#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"

require_cmd curl
require_cmd infisical
require_cmd jq
require_cmd openssl
require_cmd ssh

REMOTE_TARGET="$(remote_target)"
INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:-}"

[ -n "$INFISICAL_PROJECT_ID" ] || fail "Set INFISICAL_PROJECT_ID before running this script."

ensure_infisical_access_token() {
	if [ -n "${INFISICAL_ACCESS_TOKEN:-}" ]; then return; fi

	if [ -n "${INFISICAL_EMAIL:-}" ] && [ -n "${INFISICAL_PASSWORD:-}" ] && [ -n "${INFISICAL_ORGANIZATION_ID:-}" ]; then
		INFISICAL_ACCESS_TOKEN="$(
			infisical login \
				--domain="$INFISICAL_DOMAIN" \
				--email="$INFISICAL_EMAIL" \
				--password="$INFISICAL_PASSWORD" \
				--organization-id="$INFISICAL_ORGANIZATION_ID" \
				--plain \
				--silent
		)"
		export INFISICAL_ACCESS_TOKEN
		return
	fi

	fail "Requires INFISICAL_ACCESS_TOKEN, or INFISICAL_EMAIL/INFISICAL_PASSWORD/INFISICAL_ORGANIZATION_ID."
}

set_secret() {
	local assignment="$1"
	infisical secrets set \
		--silent \
		--domain="$INFISICAL_DOMAIN" \
		--projectId="$INFISICAL_PROJECT_ID" \
		--env="$INFISICAL_ENV" \
		--path="$INFISICAL_PATH" \
		"$assignment" >/dev/null
}

ensure_infisical_access_token

step "Ensuring Infisical folder path exists"
infisical secrets folders create \
	--silent \
	--domain="$INFISICAL_DOMAIN" \
	--projectId="$INFISICAL_PROJECT_ID" \
	--env="$INFISICAL_ENV" \
	--path="/" \
	--name="$(basename "$INFISICAL_PATH")" >/dev/null 2>&1 || true

get_secret() {
	infisical secrets get "$1" \
		--silent \
		--domain="$INFISICAL_DOMAIN" \
		--projectId="$INFISICAL_PROJECT_ID" \
		--env="$INFISICAL_ENV" \
		--path="$INFISICAL_PATH" \
		--plain 2>/dev/null || true
}

step "Checking if base secrets already exist"
EXISTING_DB_URL="$(get_secret DATABASE_URL)"
if [ -n "$EXISTING_DB_URL" ]; then
	success "Base secrets already exist in Infisical — skipping generation (re-run with FORCE_SECRETS=1 to overwrite)"
	if [ "${FORCE_SECRETS:-}" != "1" ]; then
		SKIP_SECRETS=1
	fi
fi

if [ "${SKIP_SECRETS:-}" != "1" ]; then
	step "Generating base secrets"
	POSTGRES_PASSWORD="$(random_alnum 32)"
	BETTER_AUTH_SECRET="$(random_alnum 40)"
	DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
	BETTER_AUTH_URL="https://$DOMAIN"
	BETTER_AUTH_TRUSTED_ORIGINS="https://$DOMAIN"

	step "Writing base secrets to Infisical"
	set_secret "DATABASE_URL=$DATABASE_URL"
	set_secret "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
	set_secret "POSTGRES_USER=$POSTGRES_USER"
	set_secret "POSTGRES_DB=$POSTGRES_DB"
	set_secret "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET"
	set_secret "BETTER_AUTH_URL=$BETTER_AUTH_URL"
	set_secret "BETTER_AUTH_TRUSTED_ORIGINS=$BETTER_AUTH_TRUSTED_ORIGINS"
	success "Base secrets stored in Infisical path $INFISICAL_PATH"
fi

info "Add any app-specific secrets manually:"
info "  infisical secrets set --domain=$INFISICAL_DOMAIN --projectId=$INFISICAL_PROJECT_ID --env=$INFISICAL_ENV --path=$INFISICAL_PATH 'MY_SECRET=value'"

step "Ensuring machine identity exists"

IDENTITY_ID="$(
	(curl -fsSL \
		-H "Authorization: Bearer $INFISICAL_ACCESS_TOKEN" \
		"$INFISICAL_DOMAIN/api/v1/projects/$INFISICAL_PROJECT_ID/identities" \
	|| true) \
	| jq -r --arg name "$INFISICAL_MACHINE_IDENTITY_NAME" '(.identities // [])[] | select(.name == $name) | .id' \
	| head -n 1
)"

if [ -z "$IDENTITY_ID" ]; then
	IDENTITY_ID="$(
		curl -fsSL \
			-X POST \
			-H "Authorization: Bearer $INFISICAL_ACCESS_TOKEN" \
			-H "Content-Type: application/json" \
			--data @- \
			"$INFISICAL_DOMAIN/api/v1/projects/$INFISICAL_PROJECT_ID/identities" <<EOF
{
  "name": "$INFISICAL_MACHINE_IDENTITY_NAME",
  "hasDeleteProtection": false,
  "metadata": [
    {
      "key": "$INFISICAL_MACHINE_IDENTITY_METADATA_KEY",
      "value": "$INFISICAL_MACHINE_IDENTITY_METADATA_VALUE"
    }
  ]
}
EOF
	)"
	IDENTITY_ID="$(printf '%s' "$IDENTITY_ID" | jq -r '.identity.id')"
	success "Created machine identity $INFISICAL_MACHINE_IDENTITY_NAME"
else
	success "Reusing machine identity $INFISICAL_MACHINE_IDENTITY_NAME"
fi

UA_RESPONSE="$(
	curl -fsSL \
		-H "Authorization: Bearer $INFISICAL_ACCESS_TOKEN" \
		"$INFISICAL_DOMAIN/api/v1/auth/universal-auth/identities/$IDENTITY_ID" 2>/dev/null || true
)"

if [ -z "$UA_RESPONSE" ] || [ "$(printf '%s' "$UA_RESPONSE" | jq -r '.identityUniversalAuth.clientId // empty')" = "" ]; then
	UA_RESPONSE="$(
		curl -fsSL \
			-X POST \
			-H "Authorization: Bearer $INFISICAL_ACCESS_TOKEN" \
			-H "Content-Type: application/json" \
			--data '{
				"clientSecretTrustedIps":[{"ipAddress":"0.0.0.0/0"},{"ipAddress":"::/0"}],
				"accessTokenTrustedIps":[{"ipAddress":"0.0.0.0/0"},{"ipAddress":"::/0"}],
				"accessTokenTTL":2592000,
				"accessTokenMaxTTL":2592000,
				"accessTokenNumUsesLimit":0,
				"accessTokenPeriod":0,
				"lockoutEnabled":true,
				"lockoutThreshold":3,
				"lockoutDurationSeconds":300,
				"lockoutCounterResetSeconds":30
			}' \
			"$INFISICAL_DOMAIN/api/v1/auth/universal-auth/identities/$IDENTITY_ID"
	)"
fi

INFISICAL_CLIENT_ID="$(printf '%s' "$UA_RESPONSE" | jq -r '.identityUniversalAuth.clientId')"
INFISICAL_CLIENT_SECRET="$(
	curl -fsSL \
		-X POST \
		-H "Authorization: Bearer $INFISICAL_ACCESS_TOKEN" \
		-H "Content-Type: application/json" \
		--data "{\"description\":\"$APP_NAME VM\",\"numUsesLimit\":0,\"ttl\":0}" \
		"$INFISICAL_DOMAIN/api/v1/auth/universal-auth/identities/$IDENTITY_ID/client-secrets" \
	| jq -r '.clientSecret'
)"

[ -n "$INFISICAL_CLIENT_ID" ] || fail "Failed to retrieve Infisical client ID."
[ -n "$INFISICAL_CLIENT_SECRET" ] || fail "Failed to create Infisical client secret."

step "Writing VM Infisical auth file"
ssh "$REMOTE_TARGET" "sudo bash -s" <<EOF
set -euo pipefail
cat >"$REMOTE_ENV_FILE" <<ENVFILE
INFISICAL_API_URL=$INFISICAL_DOMAIN
INFISICAL_PROJECT_ID=$INFISICAL_PROJECT_ID
INFISICAL_CLIENT_ID=$INFISICAL_CLIENT_ID
INFISICAL_CLIENT_SECRET=$INFISICAL_CLIENT_SECRET
ENVFILE
chmod 600 "$REMOTE_ENV_FILE"
chown root:root "$REMOTE_ENV_FILE"
EOF

success "Wrote $REMOTE_ENV_FILE on VM"
echo ""
echo -e "${BOLD}Next:${RESET} ./scripts/hetzner-deploy/05-deploy.sh"
