#!/usr/bin/env bash
# Pull latest code, rebuild images, restart containers.
# Run this on the VPS in /opt/tg-app-meet.
#
# First-time bootstrap is in DEPLOY.md; this script is for subsequent
# deploys after `git pull`.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env missing. Copy .env.production.example to .env first."
  exit 1
fi

echo "==> git pull"
git pull --ff-only

echo "==> docker compose build"
docker compose -f docker-compose.prod.yml --env-file .env build

echo "==> docker compose up -d"
docker compose -f docker-compose.prod.yml --env-file .env up -d --remove-orphans

echo "==> waiting for /health"
for i in $(seq 1 30); do
  if docker exec tgmeet-api wget -qO- http://localhost:3001/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "✓ api healthy"
    break
  fi
  sleep 2
done

echo "==> done"
docker compose -f docker-compose.prod.yml ps
