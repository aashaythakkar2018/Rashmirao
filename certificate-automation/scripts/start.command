#!/bin/bash
# ---------------------------------------------------------------------------
# Rhytara Certificate Dashboard — daily start.
#
# Double-click this file in Finder to open the dashboard. Starts the local
# database if it isn't already running, starts the app, and opens your
# browser to the dashboard automatically.
#
# Leave this Terminal window open while you use the dashboard. To stop,
# close this window or press Ctrl+C.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")/.."

PG_DIR="$HOME/.local/rhytara-postgres"
PG_BIN="$PG_DIR/pg17/bin"
PG_DATA="$PG_DIR/data"
PG_PORT=5433

if [ ! -f ".env" ]; then
  echo "No .env found - run setup-mac.command first (in this same folder)."
  read -p "Press Enter to close this window..."
  exit 1
fi

if ! "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1; then
  echo "Starting database..."
  "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_DIR/logfile" -o "-p $PG_PORT -k /tmp" start >/dev/null
  sleep 2
fi
echo "✓ Database running"

echo "Starting Rhytara Certificate Dashboard..."
echo ""
# Open in Google Chrome when it's installed, so certificate previews use
# Chrome's PDF viewer; otherwise fall back to the default browser.
DASHBOARD_URL="http://localhost:3000/admin/dashboard/"
( sleep 3 && { open -a "Google Chrome" "$DASHBOARD_URL" 2>/dev/null || open "$DASHBOARD_URL"; } ) &

npm run dev
