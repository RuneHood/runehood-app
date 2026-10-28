#!/bin/bash
# Deploy Runehood frontend (shares carvy-db + carvy-assets; NO crons, NO signer keys: Carvy worker runs the engine).
# Deploy Carvy to the owner's Cloudflare account (separate worker, D1 and R2 from Synthpad/ToolsPump).
# Uses carvy.fun as custom domain once that zone exists in the account, otherwise the workers.dev URL.
# Usage: CLOUDFLARE_API_TOKEN=... bash deploy_carvy.sh   (token is never written to disk or the repo)
set -e
export CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}
DOMAIN=${CARVY_DOMAIN:-canvy.fun}
APP=${APP:-$(cd "$(dirname "$0")/../app" && pwd)}
WR=${WR:-$(pwd)}
W="$WR/node_modules/.bin/wrangler"
(cd "$APP" && bunx vite build >/dev/null)
mkdir -p "$WR/runehood" && cd "$WR/runehood"

DB_ID=$($W d1 list --json 2>/dev/null | python3 -c "import sys,json; print(next((d['uuid'] for d in json.load(sys.stdin) if d['name']=='carvy-db'), ''))")
if [ -z "$DB_ID" ]; then
  $W d1 create carvy-db >/dev/null
  DB_ID=$($W d1 list --json | python3 -c "import sys,json; print(next(d['uuid'] for d in json.load(sys.stdin) if d['name']=='carvy-db'))")
fi
echo "D1: $DB_ID"
$W r2 bucket create carvy-assets > /tmp/r2c.out 2>&1 || grep -q "already exists" /tmp/r2c.out

PATTERNS=""
for D in ${RUNEHOOD_DOMAINS:-runehood.fun runehood.xyz runehood.io runehood.com}; do
  Z=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones?name=$D" | python3 -c "import sys,json; r=json.load(sys.stdin).get('result') or []; print(r[0]['id'] if r else '')")
  if [ -n "$Z" ]; then
    PATTERNS="$PATTERNS{ \"pattern\": \"$D\", \"custom_domain\": true }, { \"pattern\": \"www.$D\", \"custom_domain\": true }, "
    echo "Domain: $D"
  else
    echo "Skipping $D (not in this Cloudflare account)"
  fi
done
if [ -n "$PATTERNS" ]; then
  ROUTES="\"routes\": [${PATTERNS%, }], \"workers_dev\": true"
else
  ROUTES='"workers_dev": true'
fi

cat > wrangler.jsonc <<EOF
{
  "name": "runehood",
  "account_id": "$CLOUDFLARE_ACCOUNT_ID",
  "main": "$APP/dist/server/server.js",
  "compatibility_date": "2025-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "assets": { "directory": "$APP/dist/client", "binding": "ASSETS", "not_found_handling": "none" },
  "vars": { "HF_ENV": "prod", "APP_SLUG": "runehood" },
  "d1_databases": [{ "binding": "DB", "database_name": "carvy-db", "database_id": "$DB_ID", "migrations_dir": "$APP/migrations" }],
  "r2_buckets": [{ "binding": "STORAGE", "bucket_name": "carvy-assets" }],
  $ROUTES
}
EOF
$W deploy
echo "DEPLOYED"
