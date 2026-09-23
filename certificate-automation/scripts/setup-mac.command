#!/bin/bash
# ---------------------------------------------------------------------------
# Rhytara Certificate Dashboard — first-time setup for a new Mac.
#
# Double-click this file in Finder to run it (macOS runs .command files in
# Terminal automatically). Safe to run more than once - every step skips
# itself if it's already done.
#
# What it does:
#   1. Checks for Node.js - offers to install it if missing.
#   2. Sets up a local Postgres database (no admin password needed, no
#      Homebrew required - extracts Postgres.app's own binaries).
#   3. Installs this project's dependencies.
#   4. Creates .env with fresh, unique secrets.
#   5. Creates the database tables.
# ---------------------------------------------------------------------------
set -e
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"
PG_DIR="$HOME/.local/rhytara-postgres"
PG_BIN="$PG_DIR/pg17/bin"
PG_DATA="$PG_DIR/data"
PG_PORT=5433

echo "=========================================================="
echo " Rhytara Certificate Dashboard — setup"
echo "=========================================================="
echo ""

# ---- 1. Node.js ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Opening the official installer..."
  echo "Run this script again after installing (you may need to open a new Terminal window)."
  curl -sL -o /tmp/node-installer.pkg "https://nodejs.org/dist/v20.17.0/node-v20.17.0.pkg"
  open /tmp/node-installer.pkg
  exit 0
fi
echo "✓ Node.js found: $(node --version)"

# ---- 2. Local Postgres -------------------------------------------------------
if [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo ""
  echo "Setting up a local database (one-time, ~1 minute)..."
  mkdir -p "$PG_DIR"
  curl -sL -o /tmp/postgres-app.dmg "https://github.com/PostgresApp/PostgresApp/releases/download/v2.7.9/Postgres-2.7.9-17.dmg"
  hdiutil attach /tmp/postgres-app.dmg -nobrowse -mountpoint /tmp/pgapp-mount >/dev/null
  cp -R "/tmp/pgapp-mount/Postgres.app/Contents/Versions/17" "$PG_DIR/pg17"
  hdiutil detach /tmp/pgapp-mount >/dev/null
  rm -f /tmp/postgres-app.dmg
  echo "✓ Database engine installed"
fi

if [ ! -d "$PG_DATA" ]; then
  "$PG_BIN/initdb" -D "$PG_DATA" -U rhytara -A trust --encoding=UTF8 >/dev/null
  echo "✓ Database initialized"
fi

if ! "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1; then
  "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_DIR/logfile" -o "-p $PG_PORT -k /tmp" start >/dev/null
  sleep 2
fi
echo "✓ Database running on port $PG_PORT"

if ! "$PG_BIN/psql" -h localhost -p $PG_PORT -U rhytara -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw rhytara_certificates; then
  "$PG_BIN/createdb" -h localhost -p $PG_PORT -U rhytara rhytara_certificates
  echo "✓ Database created"
fi

# ---- 3. Dependencies ----------------------------------------------------------
echo ""
echo "Installing dependencies (this may take a minute)..."
npm install --no-fund --no-audit
echo "✓ Dependencies installed"

# ---- 4. .env ------------------------------------------------------------------
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo ""
  echo "Creating .env with fresh secrets..."
  LINK_SECRET=$(openssl rand -hex 32)
  ADMIN_TOKEN=$(openssl rand -hex 32)
  cat > "$PROJECT_DIR/.env" <<EOF
EMAIL_PROVIDER=console
EMAIL_FROM="Rhytara <certificates@rhytara.com>"
EMAIL_REPLY_TO=hello@rhytara.com

CERTIFICATE_STORAGE_PROVIDER=local
CERTIFICATE_STORAGE_SIGNED_URL_TTL_SECONDS=604800
CERTIFICATE_LINK_SECRET=$LINK_SECRET

APP_BASE_URL=http://localhost:3000
PORT=3000

DATABASE_URL=postgres://rhytara@localhost:$PG_PORT/rhytara_certificates

CERTIFICATE_TEST_MODE=true
TEST_EMAIL=

ADMIN_API_TOKEN=$ADMIN_TOKEN
EOF
  echo "✓ .env created"
  echo ""
  echo "=========================================================="
  echo " YOUR DASHBOARD LOGIN TOKEN (write this down / save it):"
  echo ""
  echo "   $ADMIN_TOKEN"
  echo ""
  echo "=========================================================="
else
  echo "✓ .env already exists (leaving it as-is)"
fi

# ---- 5. Migrate -----------------------------------------------------------------
echo ""
echo "Creating database tables..."
npm run migrate
echo "✓ Database ready"

echo ""
echo "=========================================================="
echo " Setup complete!"
echo ""
echo " Double-click 'start.command' in this same folder any time"
echo " you want to open the dashboard."
echo "=========================================================="
echo ""
read -p "Press Enter to close this window..."
