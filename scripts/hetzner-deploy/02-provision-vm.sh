#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_vars.sh"

require_cmd ssh
require_cmd scp
require_cmd hcloud
require_hcloud_login

ROOT_TARGET="$(root_target)"

step "Provisioning VM packages and hardening"
ssh "$ROOT_TARGET" "bash -s" <<EOF
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

VM_USER="$VM_USER"
REMOTE_DIR="$REMOTE_DIR"
CLOUDFLARED_DEB_URL="$CLOUDFLARED_DEB_URL"

apt-get update
apt-get install -y \
	ca-certificates \
	curl \
	fail2ban \
	gnupg \
	lsb-release \
	ufw \
	unattended-upgrades

if ! id -u "\$VM_USER" >/dev/null 2>&1; then
	useradd --create-home --shell /bin/bash "\$VM_USER"
fi

install -d -m 700 -o "\$VM_USER" -g "\$VM_USER" "/home/\$VM_USER/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
	install -m 600 -o "\$VM_USER" -g "\$VM_USER" /root/.ssh/authorized_keys "/home/\$VM_USER/.ssh/authorized_keys"
fi

cat >/etc/sudoers.d/90-\$VM_USER <<SUDOERS
\$VM_USER ALL=(ALL) NOPASSWD:ALL
SUDOERS
chmod 440 /etc/sudoers.d/90-\$VM_USER

if ! command -v docker >/dev/null 2>&1; then
	curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "\$VM_USER"
systemctl enable --now docker

if ! command -v cloudflared >/dev/null 2>&1; then
	tmp_deb=\$(mktemp /tmp/cloudflared.XXXXXX.deb)
	curl -fsSL "\$CLOUDFLARED_DEB_URL" -o "\$tmp_deb"
	dpkg -i "\$tmp_deb" || apt-get install -fy
	rm -f "\$tmp_deb"
fi

if ! command -v infisical >/dev/null 2>&1; then
	curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash
	apt-get update
	apt-get install -y infisical
fi

mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-hardening.conf <<SSHD
PermitRootLogin no
PasswordAuthentication no
SSHD

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

install -d -m 755 -o "\$VM_USER" -g "\$VM_USER" "\$REMOTE_DIR"

# Restart SSH last — this disables root login, so all other work must be done first
systemctl restart ssh
EOF

success "VM provisioning complete"
echo ""
echo -e "${BOLD}Next:${RESET} ./scripts/hetzner-deploy/03-setup-tunnel.sh"
