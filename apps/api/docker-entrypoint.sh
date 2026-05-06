#!/bin/sh
set -e

# Run pending migrations on every boot. `migrate deploy` is idempotent — if
# everything's already applied it's a no-op. Failure here aborts boot so a
# bad migration doesn't get hidden behind a healthy-looking API.
echo "[api] running prisma migrate deploy…"
cd /app/apps/api
pnpm exec prisma migrate deploy
cd /app

echo "[api] launching: $*"
exec "$@"
