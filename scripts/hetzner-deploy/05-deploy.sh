#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"

require_cmd curl
require_cmd rsync
require_cmd scp
require_cmd ssh

REMOTE_TARGET="$(remote_target)"

step "Syncing application source to VM"
rsync -az --delete \
	--exclude node_modules \
	--exclude .git \
	--exclude .github \
	--exclude e2e \
	--exclude docs \
	--exclude ai-dev-docs \
	--exclude .context \
	--exclude .claude \
	--exclude .svelte-kit \
	--exclude build \
	--exclude playwright-report \
	--exclude test-results \
	--exclude test-report-for-coding-agents \
	--exclude scripts \
	--exclude .env \
	--exclude '.env.*' \
	"$PROJECT_ROOT/" "$REMOTE_TARGET:$REMOTE_DIR/"
success "Application source synced"

step "Templating and installing compose and systemd unit"
scp "$SCRIPT_DIR/docker-compose.prod.yml" "$REMOTE_TARGET:/tmp/docker-compose.prod.yml"

# Template the service file with actual values from _vars.sh
TEMPLATED_SERVICE="$(mktemp)"
trap 'rm -f "$TEMPLATED_SERVICE"' EXIT
sed \
	-e "s|WorkingDirectory=/opt/my-app|WorkingDirectory=$REMOTE_DIR|g" \
	-e "s|EnvironmentFile=/etc/my-app.env|EnvironmentFile=$REMOTE_ENV_FILE|g" \
	-e "s|--path=/dev-app-my-app|--path=$INFISICAL_PATH|g" \
	-e "s|Description=SvelteKit App|Description=$APP_NAME|g" \
	-e "s|-f /opt/my-app/docker-compose.prod.yml|-f $REMOTE_DIR/docker-compose.prod.yml|g" \
	-e "s|User=deploy|User=$VM_USER|g" \
	-e "s|ExecStop=/usr/bin/docker compose -f /opt/my-app/|ExecStop=/usr/bin/docker compose -f $REMOTE_DIR/|g" \
	-e "s|--env=prod|--env=$INFISICAL_ENV|g" \
	"$SCRIPT_DIR/app.service" > "$TEMPLATED_SERVICE"
scp "$TEMPLATED_SERVICE" "$REMOTE_TARGET:/tmp/$SYSTEMD_UNIT_NAME.service"

ssh "$REMOTE_TARGET" "sudo bash -s" <<EOF
set -euo pipefail
install -m 644 "/tmp/docker-compose.prod.yml" "$REMOTE_DIR/docker-compose.prod.yml"
install -m 644 "/tmp/$SYSTEMD_UNIT_NAME.service" "/etc/systemd/system/$SYSTEMD_UNIT_NAME.service"
rm -f "/tmp/docker-compose.prod.yml" "/tmp/$SYSTEMD_UNIT_NAME.service"
systemctl daemon-reload
systemctl enable "$SYSTEMD_UNIT_NAME"
systemctl restart "$SYSTEMD_UNIT_NAME"
EOF

step "Waiting for local health endpoint"
for attempt in $(seq 1 30); do
	if ssh "$REMOTE_TARGET" "curl -fsS http://127.0.0.1:3000/api/v1/public/health >/dev/null"; then
		success "Local health endpoint is returning 200"
		break
	fi
	if [ "$attempt" -eq 30 ]; then
		fail "App did not become healthy on the VM."
	fi
	sleep 2
done

step "Checking public tunnel health endpoint"
if curl -fsS "https://$DOMAIN/api/v1/public/health" >/dev/null; then
	success "Public health endpoint is returning 200"
else
	warn "Public health check failed. Verify Cloudflare DNS/tunnel propagation."
fi

echo ""
echo -e "${BOLD}Deployment complete:${RESET} https://$DOMAIN"
