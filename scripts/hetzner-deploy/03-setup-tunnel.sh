#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"

require_cmd cloudflared
require_cmd ssh
require_cmd scp

ensure_local_state_dir
REMOTE_TARGET="$(remote_target)"

discover_tunnel_id() {
	if [ -n "${TUNNEL_ID:-}" ]; then echo "$TUNNEL_ID"; return; fi
	if [ -f "$TUNNEL_ID_FILE" ]; then cat "$TUNNEL_ID_FILE"; return; fi

	local output
	if output="$(cloudflared tunnel create "$CF_TUNNEL_NAME" 2>&1)"; then
		echo "$output" | grep -Eo '[0-9a-fA-F-]{36}' | head -n 1
		return
	fi

	warn "Tunnel create did not succeed cleanly, attempting discovery from tunnel list"
	cloudflared tunnel list | awk -v name="$CF_TUNNEL_NAME" '$2 == name { print $1; exit }'
}

step "Ensuring Cloudflare tunnel exists"
TUNNEL_ID="$(discover_tunnel_id)"
[ -n "$TUNNEL_ID" ] || fail "Could not determine Cloudflare tunnel ID."
printf '%s\n' "$TUNNEL_ID" >"$TUNNEL_ID_FILE"
success "Using tunnel ID $TUNNEL_ID"

step "Ensuring DNS route exists"
cloudflared tunnel route dns "$CF_TUNNEL_NAME" "$DOMAIN" >/dev/null
success "DNS route configured for $DOMAIN"

CREDENTIALS_FILE="$CF_CREDENTIALS_DIR/$TUNNEL_ID.json"
[ -f "$CREDENTIALS_FILE" ] || fail "Tunnel credentials not found at $CREDENTIALS_FILE"

TMP_CONFIG="$(mktemp)"
trap 'rm -f "$TMP_CONFIG"' EXIT
cat >"$TMP_CONFIG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CF_REMOTE_DIR/$TUNNEL_ID.json
ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF

step "Uploading tunnel credentials and config"
scp "$CREDENTIALS_FILE" "$REMOTE_TARGET:/tmp/$TUNNEL_ID.json"
scp "$TMP_CONFIG" "$REMOTE_TARGET:/tmp/cloudflared-config.yml"

ssh "$REMOTE_TARGET" "sudo bash -s" <<EOF
set -euo pipefail

# Restrict permissions immediately after upload
chmod 600 "/tmp/$TUNNEL_ID.json"
chmod 600 "/tmp/cloudflared-config.yml"

# Install cloudflared service first (creates default config)
if ! systemctl list-unit-files | grep -q '^cloudflared\.service'; then
	cloudflared service install
fi

# Then overwrite with our config
install -d -m 755 "$CF_REMOTE_DIR"
install -m 600 "/tmp/$TUNNEL_ID.json" "$CF_REMOTE_DIR/$TUNNEL_ID.json"
install -m 644 "/tmp/cloudflared-config.yml" "$CF_REMOTE_CONFIG_PATH"
rm -f "/tmp/$TUNNEL_ID.json" "/tmp/cloudflared-config.yml"

systemctl enable --now cloudflared
systemctl restart cloudflared
EOF

success "Cloudflare tunnel configured on VM"
echo ""
echo -e "${BOLD}Next:${RESET} ./scripts/hetzner-deploy/04-setup-infisical.sh"
