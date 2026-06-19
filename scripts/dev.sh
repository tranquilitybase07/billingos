#!/usr/bin/env bash
# One command to run BillingOS fully locally, all connected:
#   Redis (docker) + local Supabase + Stripe webhook forwarding + API + web,
#   all pointed at LOCAL infra via apps/*/.env.local (never prod).
#
# Usage: pnpm dev:all   (or: bash scripts/dev.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_ENV_LOCAL="apps/api/.env.local"
PORTS=(3000 3001 3002)  # web, api, sandbox-api

step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$1"; }

# 1. Free up stale dev ports (inspired by Autumn's killPorts) ------------------
step "Freeing dev ports (${PORTS[*]})…"
for p in "${PORTS[@]}"; do
  pids="$(lsof -ti ":$p" 2>/dev/null || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null && echo "  killed stale process on :$p" || true
done

# 2. Redis — reuse a native Redis on :6379 if running, else start docker on :6380
step "Resolving Redis…"
redis_up_6379() {
  if command -v redis-cli >/dev/null 2>&1; then
    [ "$(redis-cli -p 6379 ping 2>/dev/null)" = "PONG" ]
  else
    lsof -ti tcp:6379 >/dev/null 2>&1
  fi
}
if redis_up_6379; then
  export REDIS_HOST=localhost REDIS_PORT=6379
  echo "  using native Redis already running on :6379"
else
  docker compose up -d redis
  export REDIS_HOST=localhost REDIS_PORT=6380
  echo "  started docker Redis on :6380"
fi
# Exported REDIS_PORT overrides apps/api/.env.local (process.env wins in @nestjs/config).

# 3. Local Supabase (Postgres + Auth + migrations) -----------------------------
step "Starting local Supabase…"
if supabase status >/dev/null 2>&1; then
  echo "  already running"
else
  supabase start
fi

# 4. Ensure Stripe webhook signing secret is in apps/api/.env.local ------------
step "Resolving Stripe webhook secret…"
if grep -q "^STRIPE_WEBHOOK_SECRET=whsec_" "$API_ENV_LOCAL" 2>/dev/null; then
  echo "  already set in $API_ENV_LOCAL"
else
  WHSEC="$(stripe listen --print-secret 2>/dev/null || true)"
  if [ -n "$WHSEC" ]; then
    grep -v '^STRIPE_WEBHOOK_SECRET=' "$API_ENV_LOCAL" > "$API_ENV_LOCAL.tmp" 2>/dev/null || true
    mv "$API_ENV_LOCAL.tmp" "$API_ENV_LOCAL" 2>/dev/null || true
    echo "STRIPE_WEBHOOK_SECRET=$WHSEC" >> "$API_ENV_LOCAL"
    echo "  wrote signing secret to $API_ENV_LOCAL"
  else
    warn "Could not fetch Stripe secret — run 'stripe login' once. Webhooks will fail signature check until then."
  fi
fi

# 5. Run web + api + stripe listener together ----------------------------------
step "Starting web + api + stripe listener…"
echo "  web:    http://localhost:3000"
echo "  api:    http://localhost:3001"
echo "  studio: http://localhost:54323"
echo

pnpm exec concurrently -k -n web,api,stripe -c blue,green,magenta \
  "pnpm --filter web dev" \
  "pnpm --filter api start:dev" \
  "stripe listen --forward-to localhost:3001/stripe/webhooks"
