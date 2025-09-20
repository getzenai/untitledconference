#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root (e.g. sudo ./setup_sveltekit_vibe_starter.sh)." >&2
  exit 1
fi

if [[ ! -f "package.json" ]]; then
  echo "Run this script from the sveltekit-vibe-starter project root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

APT_PACKAGES=(
  postgresql
  postgresql-client
  tmux
  jq
  less
  unzip
)

echo "Installing system dependencies..."
apt-get update >/dev/null
apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}" >/dev/null
apt-get clean >/dev/null
rm -rf /var/lib/apt/lists/*

DB_USER="root"
DB_PASSWORD="mysecretpassword"
DB_DEV="local"
DB_TEST="test"

start_postgres() {
  local pg_major
  pg_major=$(psql -V | awk '{print $3}' | cut -d. -f1)

  if ! pg_lsclusters --no-header 2>/dev/null | grep -q "^${pg_major}[[:space:]]\+main[[:space:]]"; then
    echo "Initializing PostgreSQL cluster ${pg_major}/main..."
    pg_createcluster "${pg_major}" main >/dev/null
  fi

  if ! pg_lsclusters --no-header 2>/dev/null | awk -v ver="${pg_major}" '$1 == ver && $2 == "main" && $4 == "online" {found=1} END {exit !found}'; then
    echo "Starting PostgreSQL cluster ${pg_major}/main..."
    pg_ctlcluster "${pg_major}" main start >/dev/null
  else
    echo "PostgreSQL cluster already running."
  fi

  echo "Waiting for PostgreSQL to accept connections..."
  until pg_isready -q -h localhost; do
    sleep 1
  done
}

configure_hba() {
  local hba_file
  hba_file=$(sudo -u postgres psql -Atc "SHOW hba_file;")
  if [[ -z "${hba_file}" ]]; then
    echo "Could not determine pg_hba.conf location." >&2
    exit 1
  fi
  if ! grep -q "# codex-local-dev" "${hba_file}"; then
    cat >>"${hba_file}" <<EOF_HBA
# codex-local-dev
host all ${DB_USER} 127.0.0.1/32 scram-sha-256
host all ${DB_USER} ::1/128 scram-sha-256
EOF_HBA
    sudo -u postgres psql -c "SELECT pg_reload_conf();" >/dev/null
  fi
}

ensure_role() {
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    echo "Creating role ${DB_USER}..."
    sudo -u postgres psql -c "CREATE ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
  else
    sudo -u postgres psql -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
  fi
}

ensure_database() {
  local db_name=$1
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1; then
    echo "Creating database ${db_name}..."
    sudo -u postgres createdb -O "${DB_USER}" "${db_name}"
  else
    sudo -u postgres psql -c "ALTER DATABASE \"${db_name}\" OWNER TO \"${DB_USER}\";" >/dev/null
  fi
}

update_env_urls() {
  local env_file=$1
  local db_url="postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_DEV}"
  local test_url="postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_TEST}"

  if grep -q '^DATABASE_URL=' "${env_file}"; then
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"${db_url}\"#" "${env_file}"
  else
    printf 'DATABASE_URL="%s"\n' "${db_url}" >>"${env_file}"
  fi

  if grep -q '^TEST_DATABASE_URL=' "${env_file}"; then
    sed -i "s#^TEST_DATABASE_URL=.*#TEST_DATABASE_URL=\"${test_url}\"#" "${env_file}"
  else
    printf 'TEST_DATABASE_URL="%s"\n' "${test_url}" >>"${env_file}"
  fi
}

start_postgres
configure_hba
ensure_role
ensure_database "${DB_DEV}"
ensure_database "${DB_TEST}"

if [[ ! -f .env ]]; then
  echo "Bootstrapping environment file..."
  cp .env.example .env
fi

update_env_urls .env

echo "Installing Node dependencies..."
npm install >/dev/null

echo "Synchronizing database schema..."
npm run db:push:force

npx playwright install chromium --with-deps >/dev/null

echo "Setup complete."
