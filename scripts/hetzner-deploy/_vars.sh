#!/bin/bash
# Shared configuration for the Hetzner preview deployment workflow.
# Usage: source "$(dirname "$0")/_vars.sh"
#
# Override any variable via environment before running the scripts.
# Example: APP_NAME=my-app DOMAIN=my-app.example.com ./01-create-server.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# --- App identity (MUST override for each project) ---
APP_NAME="${APP_NAME:-my-app}"
DOMAIN="${DOMAIN:-my-app.example.com}"

# --- SSH ---
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/${APP_NAME}_ed25519}"
SSH_KEY_NAME="${SSH_KEY_NAME:-$APP_NAME}"
SSH_ALIAS="${SSH_ALIAS:-$APP_NAME}"

# --- Hetzner ---
HCLOUD_SERVER_TYPE="${HCLOUD_SERVER_TYPE:-cpx11}"
HCLOUD_LOCATION="${HCLOUD_LOCATION:-nbg1}"
HCLOUD_IMAGE="${HCLOUD_IMAGE:-ubuntu-24.04}"
FW_NAME="${FW_NAME:-${APP_NAME}-fw}"

# --- VM ---
VM_USER="${VM_USER:-deploy}"
REMOTE_DIR="${REMOTE_DIR:-/opt/$APP_NAME}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/etc/${APP_NAME}.env}"
SYSTEMD_UNIT_NAME="${SYSTEMD_UNIT_NAME:-$APP_NAME}"

# --- Cloudflare Tunnel ---
CF_TUNNEL_NAME="${CF_TUNNEL_NAME:-$APP_NAME}"
CF_CREDENTIALS_DIR="${CF_CREDENTIALS_DIR:-$HOME/.cloudflared}"
CF_REMOTE_DIR="${CF_REMOTE_DIR:-/etc/cloudflared}"
CF_REMOTE_CONFIG_PATH="${CF_REMOTE_CONFIG_PATH:-$CF_REMOTE_DIR/config.yml}"

# --- Infisical ---
INFISICAL_ENV="${INFISICAL_ENV:-prod}"
INFISICAL_PATH="${INFISICAL_PATH:-/dev-app-$APP_NAME}"
INFISICAL_DOMAIN="${INFISICAL_DOMAIN:-https://eu.infisical.com}"
INFISICAL_MACHINE_IDENTITY_NAME="${INFISICAL_MACHINE_IDENTITY_NAME:-${APP_NAME}-vm}"
INFISICAL_MACHINE_IDENTITY_METADATA_KEY="${INFISICAL_MACHINE_IDENTITY_METADATA_KEY:-service}"
INFISICAL_MACHINE_IDENTITY_METADATA_VALUE="${INFISICAL_MACHINE_IDENTITY_METADATA_VALUE:-$APP_NAME}"

# --- Postgres (for docker-compose) ---
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-$(echo "$APP_NAME" | tr '-' '_')}"

# --- Local state ---
LOCAL_STATE_DIR="${LOCAL_STATE_DIR:-$HOME/.config/${APP_NAME}-hetzner}"
TUNNEL_ID_FILE="${TUNNEL_ID_FILE:-$LOCAL_STATE_DIR/tunnel-id}"

CLOUDFLARED_DEB_URL="${CLOUDFLARED_DEB_URL:-https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb}"

# --- Input validation ---
validate_name() { [[ "$1" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "Error: Invalid name '$1' — only alphanumeric, dots, hyphens, underscores allowed" >&2; exit 1; }; }
validate_name "$APP_NAME"
validate_name "$VM_USER"
validate_name "$POSTGRES_USER"
validate_name "$POSTGRES_DB"
validate_name "$INFISICAL_MACHINE_IDENTITY_METADATA_KEY"
validate_name "$INFISICAL_MACHINE_IDENTITY_METADATA_VALUE"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

step() { echo -e "${BOLD}==>${RESET} $*"; }
info() { echo -e "${DIM}$*${RESET}"; }
success() { echo -e "${GREEN}●${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
fail() { echo -e "${RED}Error:${RESET} $*" >&2; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"; }
require_hcloud_login() { hcloud server list >/dev/null 2>&1 || fail "Hetzner CLI not authenticated. Run 'hcloud context create' first."; }

ensure_local_state_dir() { mkdir -p "$LOCAL_STATE_DIR"; }

get_server_ip() {
	hcloud server list -o columns=name,ipv4 -o noheader | awk -v name="$APP_NAME" '$1 == name { print $2; exit }'
}

server_exists() { hcloud server describe "$APP_NAME" >/dev/null 2>&1; }
firewall_exists() { hcloud firewall describe "$FW_NAME" >/dev/null 2>&1; }
ssh_key_exists() { hcloud ssh-key describe "$SSH_KEY_NAME" >/dev/null 2>&1; }

resolve_remote_host() {
	local server_ip ssh_config
	server_ip="$(get_server_ip)"
	[ -n "$server_ip" ] || fail "Could not resolve server IP for '$APP_NAME'. Run 01-create-server.sh first."
	if [ -n "${REMOTE_HOST:-}" ]; then echo "$REMOTE_HOST"; return; fi
	ssh_config="$HOME/.ssh/config"
	if [ -f "$ssh_config" ] && grep -qE "^Host[[:space:]]+$SSH_ALIAS\$" "$ssh_config"; then echo "$SSH_ALIAS"; return; fi
	echo "$server_ip"
}

remote_target() { echo "${VM_USER}@$(resolve_remote_host)"; }

root_target() {
	local server_ip
	server_ip="$(get_server_ip)"
	[ -n "$server_ip" ] || fail "Could not resolve server IP for '$APP_NAME'. Run 01-create-server.sh first."
	echo "root@${server_ip}"
}

append_ssh_config() {
	local server_ip="$1"
	local ssh_config="$HOME/.ssh/config"
	mkdir -p "$HOME/.ssh"
	touch "$ssh_config"
	chmod 600 "$ssh_config"
	if grep -qE "^Host[[:space:]]+$SSH_ALIAS\$" "$ssh_config"; then
		success "SSH config already contains host '$SSH_ALIAS'"
		return
	fi
	cat >>"$ssh_config" <<EOF

Host $SSH_ALIAS
    HostName $server_ip
    User $VM_USER
    IdentityFile $SSH_KEY_PATH
    IdentitiesOnly yes
EOF
	success "Added SSH config alias '$SSH_ALIAS'"
}

random_alnum() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
