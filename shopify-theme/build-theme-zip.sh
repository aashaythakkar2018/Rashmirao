#!/usr/bin/env bash
# Package the theme for Shopify admin → Themes → Upload zip file.
# Shopify rejects archives containing __MACOSX or .DS_Store entries.
set -euo pipefail
cd "$(dirname "$0")"
OUT="../rhytara-theme.zip"
rm -f "$OUT"
find . -name '.DS_Store' -delete
zip -r -X "$OUT" \
  assets config layout locales sections snippets templates \
  -x '*.DS_Store' -x '__MACOSX/*' >/dev/null
echo "Wrote $(cd .. && pwd)/rhytara-theme.zip"
unzip -l "$OUT" | tail -3
