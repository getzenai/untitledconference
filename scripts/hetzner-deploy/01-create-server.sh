#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"

require_cmd hcloud
require_cmd ssh-keygen
require_cmd ssh-add
require_cmd awk
require_hcloud_login

step "Preparing SSH key"
mkdir -p "$(dirname "$SSH_KEY_PATH")"
if [ ! -f "$SSH_KEY_PATH" ]; then
	ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -C "$APP_NAME deploy key"
	success "Created SSH key at $SSH_KEY_PATH"
else
	success "SSH key already exists at $SSH_KEY_PATH"
fi

if ssh-add "$SSH_KEY_PATH" >/dev/null 2>&1; then
	success "Added SSH key to ssh-agent"
else
	warn "Could not add SSH key to ssh-agent automatically. Continue if your key is already available."
fi

step "Ensuring Hetzner SSH key exists"
if ssh_key_exists; then
	success "Hetzner SSH key '$SSH_KEY_NAME' already exists"
else
	hcloud ssh-key create \
		--name "$SSH_KEY_NAME" \
		--public-key-from-file "$SSH_KEY_PATH.pub"
	success "Created Hetzner SSH key '$SSH_KEY_NAME'"
fi

step "Ensuring firewall exists"
if firewall_exists; then
	success "Firewall '$FW_NAME' already exists"
else
	hcloud firewall create --name "$FW_NAME"
	hcloud firewall add-rule "$FW_NAME" \
		--description "Allow SSH" \
		--direction in \
		--protocol tcp \
		--port 22 \
		--source-ips 0.0.0.0/0 \
		--source-ips ::/0
	success "Created firewall '$FW_NAME' with SSH-only ingress"
fi

step "Ensuring server exists"
if server_exists; then
	success "Server '$APP_NAME' already exists"
else
	hcloud server create \
		--name "$APP_NAME" \
		--type "$HCLOUD_SERVER_TYPE" \
		--location "$HCLOUD_LOCATION" \
		--image "$HCLOUD_IMAGE" \
		--ssh-key "$SSH_KEY_NAME" \
		--firewall "$FW_NAME" \
		--label "app=$APP_NAME" \
		--label "managed-by=hetzner-deploy"
	success "Created server '$APP_NAME'"
fi

SERVER_IP="$(get_server_ip)"
[ -n "$SERVER_IP" ] || fail "Server was created but no IPv4 address could be determined."

step "Updating SSH config"
append_ssh_config "$SERVER_IP"

echo ""
echo -e "${BOLD}Server ready:${RESET} $APP_NAME ($SERVER_IP)"
echo -e "${DIM}Next:${RESET} ./scripts/hetzner-deploy/02-provision-vm.sh"
