#!/bin/sh
set -e

# Run pending migrations on every boot. `migrate deploy` is idempotent — if
# everything's already applied it's a no-op. Failure here aborts boot so a
# bad migration doesn't get hidden behind a healthy-looking API.
#
# CWD stays in apps/api for the exec so Node resolves @swc-node/register
# (and other devDeps) from apps/api/node_modules, where pnpm symlinks
# the per-package devDeps.
cd /app/apps/api
echo "[api] running prisma migrate deploy…"
pnpm exec prisma migrate deploy

echo "[api] launching: $*"
exec "$@"
